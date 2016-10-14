'use strict'

var assert = require('assert')
var write = require('flush-write-stream')
var bitfield = require('sparse-bitfield')
var bf = require('hypercore/lib/bitfield')

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
      if (err) return ondone(err)

      sieve.set(entry.block, true)
      persist(entry.block, next)
    })
  })

  open(function (err) {
    if (err) return ondone(err)

    catchup()

    feed.on('download', function (block, data) {
      enqueue(block)(null, data)
    })

    feed.on('update', function () {
      var oldHead = head
      var newHead = feed.blocks
      head = newHead

      for (var i = oldHead; i < newHead; i++) {
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
      lt: BITFIELD_BUFFERS + '\xff'
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
        else head = offset

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

    // var bitfieldBuffer
    // for (var byte = 0; byte < feedHas.length / 8; byte++) {
    //   // Every time we encounter the border of a sparse-bitfield bucket
    //   if (byte % bitfield.BITFIELD_LENGTH === 0) {
    //     bitfieldBuffer = bitfield.getBuffer(byte / 8)
    //     if (bitfieldBuffer == null) { // If there was no bucket
    //       // Advance to the next bucket
    //       byte += bitfield.BITFIELD_LENGTH
    //       continue
    //     }
    //   }
    //
    //   if (feedHas[byte] !== bitfieldBuffer[byte % 1024]) {
    //     for (var bit = byte * 8, end = bit + 8; bit < end; bit++) {
    //       if (sieve.get(bit) === false) feed.get(bit, enqueue(bit))
    //     }
    //   }
    // }
  }

  function enqueue (block) {
    return function (err, data) {
      if (err) return queue.destroy(err)

      queue.write({block: block, data: data})
    }
  }
}
