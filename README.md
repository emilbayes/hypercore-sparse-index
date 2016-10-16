# WIP `hypercore-sparse-index`

> Index blocks as they're available

## Usage

```js
'use strict'

var memdb = require('memdb')
var hypercore = require('hypercore')
var sparseIndex = require('hypercore-sparse-index')

var feed = hypercore(memdb()).createFeed('feed-key-from-somewhere', {sparse: true})

sparseIndex({
  db: memdb(),
  feed: feed
}, function (entry, next) {
  console.log(entry)

  next()
}, function (err) {
  console.error(err)
})

// Indirectly download blocks from source feed
feed.get(0, function () {})
feed.get(1, function () {})
feed.get(2, function () {})

```

## API

#### `HypercoreSparseIndex(opts, onentry, [ondone])`

`onentry(data, callback)` is called for each entry as it is available, either
because it was appended locally or fetched remotely. On entry will only be
called once for each block. `ondone(error)` is called when the index encounters
an error, which can be from `onentry` or other sources, or when the feed is
closed.

`opts` has the following signature, all properties being required:

```js
{
  db, // Level instance
  feed // Hypercore feed
}
```

## License

[ISC](LICENSE.md)
