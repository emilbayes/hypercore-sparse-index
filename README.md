# WIP `hypercore-sparse-index`

> Index blocks as they're downloaded

Note: This module is strongly limited in that it only indexes blocks on startup
and as they're downloaded. Meaning it will not index new blocks as they're
appended

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

feed.get(0, function () {})
feed.get(1, function () {})
feed.get(2, function () {})

```

## API

#### `HypercoreSparseIndex(opts, onentry, [onerror])`

```js
{
  db, // Level instance
  feed // Hypercore feed
}
```

## License

[ISC](LICENSE.md)
