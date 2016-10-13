'use strict'

var memdb = require('memdb')
var hypercore = require('hypercore')
var sparseIndex = require('.')
var test = require('tape')

test('local index', function (assert) {
  var blocks = ['0', '1', '2', '3', '4', '5', '6', '7']
  var expected = blocks.slice()

  function assertMessage (block) {
    var idx
    assert.ok(idx = expected.indexOf(block))
    expected.splice(idx, 1)

    if (expected.length === 0) assert.end()
  }

  var feed1 = create().createFeed()

  feed1.append(blocks.pop())
  feed1.append(blocks.pop())

  sparseIndex({
    db: memdb(),
    feed: feed1
  }, function (entry, next) {
    assertMessage(entry)
    next()
  }, function (err) {
    assert.error(err)
  })

  feed1.append(blocks.splice(0, 2))

  feed1.flush(function () {
    feed1.append(blocks.pop())
    feed1.append(blocks.pop())
    feed1.append(blocks.splice(0, 2))
  })
})

test('live replicated index', function (assert) {
  var blocks = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  var expected = blocks.slice()

  function assertMessage (block) {
    var idx
    assert.ok(-1 !== (idx = expected.indexOf(block.toString())))
    expected.splice(idx, 1)
    if (expected.length === 0) assert.end()
  }

  var feed1 = create().createFeed()

  feed1.append(blocks.pop())
  feed1.append(blocks.pop())

  feed1.append(blocks.splice(0, 2))

  feed1.flush(function () {
    var feed2 = create().createFeed(feed1.key)

    feed1.append(blocks.pop())
    replicate(feed1, feed2)
    feed1.append(blocks.pop())

    sparseIndex({
      db: memdb(),
      feed: feed2
    }, function (entry, next) {
      assertMessage(entry)
      next()
    }, function (err) {
      assert.error(err)
    })

    feed1.flush(function () {
      feed1.append(blocks.pop())
      feed1.append(blocks.pop())
      feed1.append(blocks.splice(0, 2))
    })
  })
})

test('sparse index', function (assert) {
  var blocks = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  var expected = ['0', '4', '6', '8', '9']

  function assertMessage (block) {
    var idx
    assert.ok(-1 !== (idx = expected.indexOf(block.toString())))
    expected.splice(idx, 1)
    if (expected.length === 0) assert.end()
  }

  var feed1 = create().createFeed()

  feed1.append(blocks.splice(0, 4))

  feed1.flush(function () {
    var feed2 = create().createFeed(feed1.key, {sparse: true})

    replicate(feed1, feed2)
    feed1.append(blocks.splice(0, 2))

    feed2.get(0, noop)
    feed2.get(4, noop)

    sparseIndex({
      db: memdb(),
      feed: feed2
    }, function (entry, next) {
      assertMessage(entry)
      next()
    }, function (err) {
      assert.error(err)
    })

    feed2.get(6, noop)

    feed1.flush(function () {
      feed1.append(blocks.splice(0, 4))

      feed2.get(8, noop)
      feed2.get(9, noop)
    })
  })
})

function noop () {}

function create (opts) {
  return hypercore(memdb({keyEncoding: 'json'}), opts)
}

function replicate (a, b) {
  var stream = a.replicate()
  stream.pipe(b.replicate()).pipe(stream)
}
