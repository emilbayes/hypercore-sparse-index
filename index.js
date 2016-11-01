'use strict'

var assert = require('assert')
var write = require('flush-write-stream')
var bitfield = require('sparse-bitfield')

// leveldb prefixes
var BITFIELD_BUFFERS = '!_bitfield_buffers!'
var HEAD_OFFSET = '!_head_offset!'

function noop () {}

module.exports = function (opts, onentry, ondone) {
  assert.ok(opts, 'opts must be given')
  assert.ok(opts.db, 'opts.db must be given')
  assert.ok(opts.feed, 'opts.feed must be given')
  assert.ok(typeof onentry === 'function', 'onentry must be a function')
  assert.ok(ondone == null ? true : typeof ondone === 'function', 'ondone must be a function')

  var feed = opts.feed
  var db = opts.db

  ondone = ondone || noop

  // The sieve will serve to record which nodes have been indexed
  var sieve = bitfield()
  // head tracks which blocks have been queued as they're appended. See on('update')
  var head

  var queue = write.obj({highWaterMark: 0}, function (node, _, next) {
    assert.ok(sieve.get(node.block) === false)

    onentry(node.data, function (err) {
      if (err) return next(err)

      sieve.set(node.block, true)
      persist(node.block, function (err) {
        if (err) return next(err)
        pending--
        if (closed && flushed && pending === 0) queue.end()
        next()
      })
    })
  })

  var finished = false
  var errored = false
  var closed = false
  var flushed = false
  var pending = 0

  queue.on('error', function (err) {
    errored = true
    return ondone(err)
  })

  queue.on('finish', function () {
    finished = true
    return ondone()
  })

  // Might close before we have gotten our previous state
  feed.on('close', function () {
    closed = true
    feed.flush(function (err) {
      if (err) return queue.destroy(err)
      flushed = true
    })
  })

  // First find previous state
  open(function (err) {
    if (err) return queue.destroy(err)
    // Wait for blocks waiting to be appended
    feed.flush(function (err) {
      if (err) return queue.destroy(err)

      // Catch up sync
      catchup()

      // Then listen for new changes
      feed.on('download', function (block, data) {
        // We can directly enqueue here
        enqueue(block)(null, data)
      })

      feed.on('update', function () {
        var oldHead = head
        var head = feed.blocks

        for (var i = oldHead; i < head; i++) {
          if (feed.has(i)) feed.get(i, enqueue(i))
        }
      })
    })
  })

  function open (cb) {
    // Read all buffers for bitfield and head offset
    db.createReadStream({
      gt: BITFIELD_BUFFERS,
      lt: BITFIELD_BUFFERS + '\xff',
      valueEncoding: 'binary'
    })
    .on('data', function (data) {
      var index = data.key.slice(BITFIELD_BUFFERS.length) * bitfield.BITFIELD_LENGTH
      sieve.setBuffer(index, data.value)
    })
    .on('error', cb.bind(this))
    .on('end', function () {
      db.get(HEAD_OFFSET, function (err, offset) {
        if (err && !err.notFound) return cb(err)
        if (err && err.notFound) head = 0
        else head = Number(offset)

        cb()
      })
    })
  }

  function persist (index, cb) {
    // Find the buffer and write it and head offset
    var bufIdx = Math.floor(index / bitfield.BITFIELD_LENGTH)
    var buf = sieve.getBuffer(index)

    db.put(BITFIELD_BUFFERS + bufIdx, buf, function (err) {
      if (err) return cb(err)

      db.put(HEAD_OFFSET, head, cb)
    })
  }

  function catchup () {
    // Much easier, less clever way
    for (var i = 0; i < feed.blocks; i++) {
      if (feed.has(i) && sieve.get(i) === false) feed.get(i, enqueue(i))
    }
  }

  function enqueue (block) {
    return function (err, data) {
      if (err) return queue.destroy(err)
      if (finished || errored) return
      pending++
      queue.write({block: block, data: data})
    }
  }
}
