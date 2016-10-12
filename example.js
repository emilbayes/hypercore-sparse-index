'use strict'

var memdb = require('memdb')
var hypercore = require('hypercore')
var hypercoreSparseIndex = require('.')

var core1 = hypercore(memdb())
var core2 = hypercore(memdb())

var A = core1.createFeed({ sparse: true })

A.append('hello')  // 0
A.append('hi')     // 1
A.append('hej')    // 2
A.append('hallo')  // 3
A.append('heysan') // 4

A.flush(function () {
  var B = core2.createFeed(A.key, { sparse: true })

  replicate(A, B)

  hypercoreSparseIndex({
    db: memdb(),
    feed: B
  }, function (data, done) {
    console.log('B', data.toString())

    done()
  }, function (err) {
    if (err) throw err
  })

  B.get(0, function () {})
  B.get(3, function () {})
  B.get(4, function () {})
})

function replicate (a, b) {
  var stream = a.replicate()
  stream.pipe(b.replicate()).pipe(stream)
}
