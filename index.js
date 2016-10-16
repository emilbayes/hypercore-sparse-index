'use strict'

var assert = require('assert')
var write = require('flush-write-stream')
var bitfield = require('sparse-bitfield')

var BITFIELD_BUFFERS = '!_bitfield_buffers!'
var HEAD_OFFSET = '!_head_offset!'

module.exports = HypercoreSparseIndex
function HypercoreSparseIndex (opts, onentry, ondone) {
  assert.ok(opts.db, 'opts.db must be given')
  assert.ok(opts.feed, 'opts.feed must be given')
  assert.equal(typeof onentry, 'function', 'onentry must be a function')

  var feed = opts.feed
  var db = opts.db

  // The sieve will serve to record which nodes have been indexed
  var sieve = bitfield()
  // head tracks which blocks have been as they're appended. See on('update')
  var head

  var queue = write.obj(function (entry, _, next) {
    onentry(entry.data, function (err) {
      if (err) return next(err)

      sieve.set(entry.block, true)
      persist(entry.block, next)
    })
  })

  queue.on('error', ondone)
  queue.on('finish', ondone)

  open(function (err) {
    if (err) return queue.destroy(err)

    catchup()
    feed.on('download', function (block, data) {
      enqueue(block)(null, data)
    })

    feed.on('update', function () {
      var oldHead = head
      var head = feed.blocks

      for (var i = oldHead; i < head; i++) {
        if (feed.has(i)) feed.get(i, enqueue(i))
      }
    })

    feed.on('close', function () {
      queue.end()
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
      sieve.setBuffer(data.key.slice(BITFIELD_BUFFERS.length) * 8, data.value)
    })
    .on('error', function (err) {
      return cb(err)
    })
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
    var bufIdx = Math.floor(index / 8)
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

      queue.write({block: block, data: data})
    }
  }
}
