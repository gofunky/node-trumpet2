var Readable = require('readable-stream').Readable;
var Writable = require('readable-stream').Writable;
var Duplex = require('readable-stream').Duplex;
var inherits = require('inherits');
var through = require('through2');
var duplexer = require('duplexer2');
var combine = require('stream-combiner');

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
    this._writing = false;
    this._piping = false;
    this._select = this._tokenize.pipe(select());
    this._select.once('end', function () { self.push(null) });
    this.once('finish', function () { self._tokenize.end() });
}

Trumpet.prototype.pipe = function () {
    this._piping = true;
    return Duplex.prototype.pipe.apply(this, arguments);
};

Trumpet.prototype._read = function (n) {
    var self = this;
    var buf, read = 0;
    var s = this._select;
    while ((row = s.read()) !== null) {
        this.push(row[1]);
        read ++;
    }
    if (read === 0) s.once('readable', function () { self._read(n) });
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
    
    var res = self._selectAll(str, function (elem) {
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
    return this._selectAll(str, cb);
};

Trumpet.prototype._selectAll = function (str, cb) {
    var self = this;
    var readers = [], writers = [], duplex = [];
    var gets = [], sets = [];
    
    var element, welem;
    this._select.select(str, function (elem) {
        element = elem;
        welem = wrapElem(elem);
        if (cb) cb(welem);
        
        elem.once('close', function () {
            element = null;
            welem = null;
        });
        
        readers.splice(0).forEach(function (r) {
            welem.createReadStream(r._options).pipe(r);
        });
        
        writers.splice(0).forEach(function (w) {
            w.pipe(welem.createWriteStream(w._options));
        });
        
        duplex.splice(0).forEach(function (d) {
            d.input.pipe(welem.createStream(d.options))
                .pipe(d.output)
            ;
        });
        
        gets.splice(0).forEach(function (g) {
            welem.getAttribute(g[0], g[1]);
        });
        
        sets.splice(0).forEach(function (g) {
            welem.setAttribute(g[0], g[1]);
        });
    });
    
    return {
        getAttribute: function (key, cb) {
            if (welem) return welem.getAttribute(key, cb);
            gets.push([ key, cb ]);
        },
        setAttribute: function (key, value) {
            if (welem) return welem.setAttribute(key, value);
            sets.push([ key, value ]);
        },
        createReadStream: function (opts) {
            if (welem) return welem.createReadStream(opts);
            var r = through();
            r._options = opts;
            readers.push(r);
            return r;
        },
        createWriteStream: function (opts) {
            if (welem) return welem.createWriteStream(opts);
            var w = through();
            w._options = opts;
            writers.push(w);
            return w;
        },
        createStream: function (opts) {
            if (welem) return welem.createStream(opts);
            var d = { input: through(), output: through() };
            d.options = opts;
            duplex.push(d);
            return duplexer(d.input, d.output);
        }
    };
};

function wrapElem (elem) {
    if (elem._wrapped) return elem;
    
    var getAttribute = elem.getAttribute;
    elem.getAttribute = function (key, cb) {
        var value = getAttribute.call(elem, key);
        if (cb) cb(value);
        return value;
    };
    
    var createReadStream = elem.createReadStream;
    elem.createReadStream = function (opts) {
        if (!opts) opts = {};
        return createReadStream.call(elem, { inner: !opts.outer });
    };
    
    var createWriteStream = elem.createWriteStream;
    elem.createWriteStream = function (opts) {
        if (!opts) opts = {};
        return createWriteStream.call(elem, { inner: !opts.outer });
    };
    
    var createStream = elem.createStream;
    elem.createStream = function (opts) {
        if (!opts) opts = {};
        var w = through.obj(function (buf, enc, next) {
            this.push([ 'data', buf ]);
            next();
        });
        var r = through.obj(function (row, enc, next) {
            this.push(row[1]);
            next();
        });
        var s = createStream.call(elem, { inner: !opts.outer });
        return combine(w, s, r);
    };
    
    elem._wrapped = true;
    return elem;
}
    
Trumpet.prototype.createReadStream = function (sel, opts) {
    return this.select(sel).createReadStream(opts);
};

Trumpet.prototype.createWriteStream = function (sel, opts) {
    return this.select(sel).createWriteStream(opts);
};
