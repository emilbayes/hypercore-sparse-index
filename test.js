'use strict'

var memdb = require('memdb')
var hypercore = require('hypercore')
var index = require('.')
var test = require('tape')

test('constructor', function (assert) {
  index({
    db: memdb(),
    feed: create().createFeed()
  }, function () {})

  index({
    db: memdb(),
    feed: create().createFeed()
  }, function () {}, function () {})

  assert.end()
})

test('should throw with wrong constructor options', function (assert) {
  // An exercise in combinatorics
  assert.throws(function () {
    index()
  }, 'no arguments')

  assert.throws(function () {
    index({})
  }, 'no opts.db or opts.feed')

  assert.throws(function () {
    index({db: memdb()})
  }, 'no opts.feed')

  assert.throws(function () {
    index({feed: create().createFeed()})
  }, 'no opts.db')

  assert.throws(function () {
    index({feed: create().createFeed(), db: memdb()})
  }, 'no onentry')

  assert.throws(function () {
    index({feed: create().createFeed(), db: memdb()}, 123)
  }, 'onentry not function')

  assert.throws(function () {
    index({feed: create().createFeed(), db: memdb()}, function () {}, 123)
  }, 'ondone set, but not function')

  assert.end()
})

test('local index', function (assert) {
  var feed = create().createFeed()

  feed.append('0')
  feed.append('1')
  feed.flush(function () {
    index({
      feed: feed,
      db: memdb()
    }, assertEntry, assert.error)

    feed.append('2')
    feed.append('3')
    feed.append(['4', '5'])
  })

  var expected = new Set(['0', '1', '2', '3', '4', '5'])
  function assertEntry (entry, next) {
    assert.ok(expected.delete(entry.toString()), 'saw ' + entry.toString())
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
    }, assertEntry, assert.error)

    feed.append('2')
    feed.append('3')
    feed.append(['4', '5'])
  })

  var expected = new Set(['0', '1', '2', '3', '4', '5'])
  function assertEntry (entry, next) {
    assert.ok(expected.delete(entry.toString()), 'saw ' + entry.toString())
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
    }, assertEntry, assert.error)

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
  function assertEntry (entry, next) {
    assert.ok(expected.delete(entry.toString()), 'saw ' + entry.toString())
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
    assert.ok(expected.delete(entry.toString()), 'saw ' + entry.toString())
    next()
  }

  function assertDone (err) {
    assert.equal(expected.size, 0, 'should have indexed all entries')
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
    }, assertEntry1, function (err) {
      assert.error(err)

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
      }, assertEntry2, assert.error)
    })

    feed.append('4')
    feed.close()
  })

  var expected1 = new Set(['0', '2', '4'])
  function assertEntry1 (entry, next) {
    assert.ok(expected1.delete(entry.toString()), 'saw ' + entry.toString())
    next()
  }

  var expected2 = new Set(['1', '3', '5'])
  function assertEntry2 (entry, next) {
    assert.ok(expected2.delete(entry.toString()), 'saw ' + entry.toString())
    if (expected2.size === 0) {
      assert.equal(expected1.size, 0, 'should have index all entries')
      return assert.end()
    }
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
