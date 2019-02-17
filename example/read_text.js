const trumpet = require('../')
const tr = trumpet()

tr.selectAll('html *', function (elem) {
  elem.createReadStream()
    .pipe(elem.createWriteStream({ outer: true }))
})
tr.select('html').createReadStream().pipe(process.stdout)

const fs = require('fs')
fs.createReadStream(`${__dirname}/html/read_all.html`).pipe(tr)
