'use strict'

var assert = require('assert')
var write = require('flush-write-stream')
var bitfield = require('hypercore/lib/bitfield')
var rle = require('bitfield-rle')

module.exports = HypercoreSparseIndex
function HypercoreSparseIndex (opts, onentry, ondone) {
  assert.ok(opts.db, 'opts.db must be given')
  assert.ok(opts.feed, 'opts.feed must be given')
  assert.equal(typeof onentry, 'function', 'onentry must be a function')

  var feed = opts.feed
  var db = opts.db
  var sieve

  var indexSink = write.obj(function (node, enc, next) {
    onentry(node.data, function (err, done) {
      if (err) return next(err)

      sieve.set(node.block, true)

      // This seems rather inefficient
      db.put('_indexBitfield', rle.encode(sieve.toBuffer()), next)
    })
  })
  indexSink.on('finish', ondone)
  indexSink.on('error', ondone)

  db.get('_indexBitfield', function (err, buf) {
    if (err && !err.notFound) return ondone(err)
    if (err && err.notFound) sieve = bitfield(feed.bitfield.length)
    else sieve = bitfield(rle.decode(buf))

    catchup()

    feed.on('download', function (block, data) {
      if (sieve.get(block) === false) writeThunk(block)(null, data)
    })
  })

  function catchup () {
    var has = feed.bitfield

    if (has.buffer.length < sieve.buffer.length) return ondone(new Error('Feed is shorter than index'))
    // Compare bitfields until we find a byte that's different
    for (var byteIndex = 0, bytes = has.buffer.length; byteIndex < bytes; byteIndex++) {
      if (sieve.buffer[byteIndex] !== has.buffer[byteIndex]) {
        // Then start comparing bits
        for (var bit = byteIndex * 8, byteEnd = bit + 8; bit < byteEnd; bit++) {
          if (sieve.get(bit) === false) feed.get(bit, writeThunk(bit))
        }
      }
    }
  }

  function writeThunk (block) {
    return function (err, data) {
      if (err) {
        indexSink.destroy()
        return ondone(err)
      }

      indexSink.write({block: block, data: data})
    }
  }
}
