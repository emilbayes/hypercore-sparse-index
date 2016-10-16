'use strict'

var memdb = require('memdb')
var hypercore = require('hypercore')
var index = require('.')
var test = require('tape')

test('local index', function (assert) {
  var feed = create().createFeed()

  feed.append('0')
  feed.append('1')
  feed.flush(function () {
    index({
      feed: feed,
      db: memdb()
    }, entryAssert, assert.error)

    feed.append('2')
    feed.append('3')
    feed.append(['4', '5'])
  })

  var expected = new Set(['0', '1', '2', '3', '4', '5'])
  function entryAssert (entry, next) {
    assert.ok(expected.delete(entry.toString()))
    if (expected.size === 0) return assert.end()
    next()
  }
})

test('live replicated index', function (assert) {
  var feed = create().createFeed()
  var clone = create().createFeed(feed.key)

  feed.append('0')
  feed.append('1')
  feed.flush(function () {
    replicate(feed, clone)

    index({
      feed: clone,
      db: memdb()
    }, entryAssert, assert.error)

    feed.append('2')
    feed.append('3')
    feed.append(['4', '5'])
  })

  var expected = new Set(['0', '1', '2', '3', '4', '5'])
  function entryAssert (entry, next) {
    assert.ok(expected.delete(entry.toString()))
    if (expected.size === 0) return assert.end()
    next()
  }
})

test('live replicated, sparse index', function (assert) {
  var feed = create().createFeed()
  var clone = create().createFeed(feed.key, {sparse: true})

  feed.append('0')
  feed.append('1')
  feed.flush(function () {
    replicate(feed, clone)

    index({
      feed: clone,
      db: memdb()
    }, entryAssert, assert.error)

    clone.get(0, function (_) {
      feed.append('2')
      feed.append('3')
      feed.append(['4', '5'])
      feed.flush(function () {
        clone.get(4, function (_) {
          clone.get(2, function (_) {

          })
        })
      })
    })
  })

  var expected = new Set(['0', '2', '4'])
  function entryAssert (entry, next) {
    assert.ok(expected.delete(entry.toString()))
    if (expected.size === 0) return assert.end()
    next()
  }
})

test('should call ondone when closed', function (assert) {
  var feed = create().createFeed()

  feed.append('0')
  feed.append('1')
  index({
    feed: feed,
    db: memdb()
  }, assertEntry, assertDone)

  feed.append(['2', '3', '4'])

  var expected = new Set(['0', '1', '2', '3', '4'])

  function assertEntry (entry, next) {
    assert.ok(expected.delete(entry.toString()), entry.toString())
    next()
  }

  function assertDone (err) {
    assert.error(err, 'should not error')
    assert.end()
  }

  feed.close()
})

test('should call ondone when error', function (assert) {
  var feed = create().createFeed()

  feed.append('0')
  feed.append('1')

  index({
    feed: feed,
    db: memdb()
  }, assertEntry, assertDone)

  feed.append(['2', '3', '4'])

  var expected = new Error('dummy error')

  function assertEntry (entry, next) {
    next(expected)
  }

  function assertDone (err) {
    assert.equal(err, expected, 'should be the same error')
    assert.end()
  }
})

test('catchup after being offline', function (assert) {
  var core = create()
  var feed = core.createFeed()

  var db = memdb()

  feed.append('0')
  feed.append('2')
  feed.flush(function () {
    index({
      feed: feed,
      db: db
    }, entryAssert1, assert.error)

    feed.append('4')
    feed.close(function () {
      // "Continue" feed, but different instance
      var clone = core.createFeed({
        key: feed.key,
        secretKey: feed.secretKey
      })
      clone.append('1')
      clone.append(['3', '5'])

      index({
        feed: clone,
        db: db
      }, entryAssert2, assert.error)
    })
  })

  var expected1 = new Set(['0', '2', '4'])
  function entryAssert1 (entry, next) {
    assert.ok(expected1.delete(entry.toString()))
    next()
  }

  var expected2 = new Set(['1', '3', '5'])
  function entryAssert2 (entry, next) {
    assert.ok(expected2.delete(entry.toString()))
    if (expected2.size === 0) return assert.end()
    next()
  }
})

function create (opts) {
  return hypercore(memdb({keyEncoding: 'json'}), opts)
}

function replicate (a, b, optsA, optsB) {
  var stream = a.replicate(optsA)
  stream.pipe(b.replicate(optsB)).pipe(stream)
}
