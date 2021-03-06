const trumpet = require('../')
const through = require('through2')
const test = require('tape')
const concat = require('concat-stream')

test('write stream', (t) => {
  t.plan(1)

  const tr = trumpet()
  const link = tr.select('a')
  const ws = link.createWriteStream()
  link.setAttribute('href', '/beep')

  const s = through()
  s.pipe(ws)

  s.write('beep')

  setTimeout(() => {
    s.write(' boop.')
    s.end()
  }, 500)

  tr.pipe(concat((body) => {
    t.equal(
      String(body),
      '<html><body><a href="/beep">beep boop.</a></body></html>'
    )
  }))
  tr.end('<html><body><a></a></body></html>')
})
