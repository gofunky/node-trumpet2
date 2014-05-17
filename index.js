var Readable = require('readable-stream').Readable;
var Writable = require('readable-stream').Writable;
var Duplex = require('readable-stream').Duplex;
var inherits = require('inherits');

var tokenize = require('html-tokenize');
var select = require('html-select');
var parseTag = require('html-select/lib/parse_tag.js');

module.exports = Trumpet;
inherits(Trumpet, Duplex);

function Trumpet () {
    var self = this;
    if (!(this instanceof Trumpet)) return new Trumpet;
    Duplex.call(this);
    this._tokenize = tokenize();
    this._select = select();
    this._tokenize.pipe(this._select);
    this._writing = false;
    this._piping = false;
}

Trumpet.prototype.pipe = function () {
    this._piping = true;
    return Duplex.prototype.pipe.apply(this, arguments);
};

Trumpet.prototype._read = function (n) {
    var self = this;
    var s = this._select;
    var buf, read = 0;
    while ((row = s.read()) !== null) {
        this.push(row[1]);
        read ++;
    }
    if (read === 0) s.once('readable', function () { self._read(n) });;
};

Trumpet.prototype._write = function (buf, enc, next) {
    if (!this._writing && !this._piping) {
        this._piping = true;
        this.resume();
    }
    return this._tokenize._write(buf, enc, next);
};

Trumpet.prototype.select = function (str, cb) {
    var self = this;
    var first = true;
    
    var res = self.selectAll(str, function (elem) {
        if (!first) return;
        first = false;
        res.createReadStream = function () {};
        res.createWriteStream = function () {};
        res.createStream = function () {};
        if (cb) cb(elem);
    });
    return res;
};

Trumpet.prototype.selectAll = function (str, cb) {
    var self = this;
    self._select.select(str, function (elem) {
        self._augment(elem, function (tag) {
            if (cb) cb(tag);
            queue.splice(0).forEach(function (q) {
                tag[q[0]].apply(tag, q.slice(1));
            });
            
            var rs, ws, ds;
            
            if (readers.length) rs = tag.createReadStream();
            readers.splice(0).forEach(function (r) {
                r._read = function () {
                    var buf, reads = 0;
                    while ((buf = rs.read()) !== null) {
                        r.push(buf);
                        reads ++;
                    }
                    if (reads === 0) rs.once('readable', r._read);
                };
                if (r._pending) r._read();
            });
        });
    });
    
    var readers = [];
    var queue = [];
    return {
        getAttribute: function (key, cb) {
            queue.push([ 'getAttribute', key, cb ]);
        },
        getName: function (cb) {
            queue.push([ 'getName', cb ]);
        },
        createReadStream: function (opts) {
            var r = new Readable;
            r._read = function () { r._pending = true };
            readers.push(r);
            return r;
        },
    };
};

Trumpet.prototype._augment = function (elem, cb) {
    var self = this;
    var stream = elem.createStream();
    (function read () {
        var row = stream.read();
        if (row === null) return stream.once('readable', read);
        stream.unshift(row);
        var p = parseTag(row[1]);
        cb(self._augmentTag(stream, p));
    })();
};

Trumpet.prototype._augmentTag = function (stream, p) {
    var self = this;
    return {
        createReadStream: function (opts) {
            var r = new Readable;
            r._read = function () {
                var buf, reads = 0;
                while ((buf = stream.read()) !== null) {
                    r.push(buf[1]);
                    stream.write(buf);
                    reads ++;
                }
                if (reads === 0) stream.on('readable', r._read);
            };
            return r;
        },
        createWriteStream: function (opts) {
            self._writing = true;
            var w = new Writable;
            w._write = function (buf, enc, next) {
                stream.write([ 'buffer', buf ]);
                next();
            };
            w.once('finish', function () { stream.end() });
            stream.resume();
            return w;
        },
        createStream: function (opts) { return stream },
        name: p.name,
        attributes: p.getAttributes(),
        getAttribute: function (key, cb) { cb(p.getAttributes()[key]) },
        getName: function (cb) { cb(p.name) }
    };
};

Trumpet.prototype.createReadStream = function (sel, opts) {
    return this.select(sel).createReadStream(opts);
};

Trumpet.prototype.createWriteStream = function (sel, opts) {
    return this.select(sel).createWriteStream(opts);
};
