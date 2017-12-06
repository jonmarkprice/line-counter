"use strict";

const fs = require("fs");
const npath = require("path");
const R = require("ramda");
const F = require("fluture");

const showError = R.curry(function(path, val, err) {
  console.error(`${path}: ${err.message}`);
  return F.of(val);
});

const sum = R.curry(function(getter, items) {
  return items.reduce((sum, item) => sum + getter(item), 0);
});

function readDir(dir) {
  return F.node(done => fs.readdir(dir, done));
}

function isDir(path) {
  return F.node(done => fs.stat(path, (err, stats) => {
    done(err, stats && stats.isDirectory());
  }));
}

// Returns the number of occurrences of "\n" in an instance of `Buffer`.
function countLinesOfBuffer(buf) {
  let count = 0, pos = 0;
  for (;;) {
    const idx = buf.indexOf("\n", pos);
    if (idx !== -1) {
      count++;
      pos = idx + 1;
    } else {
      break;
    }
  }
  return count;
}

function countLinesOfFile(path) {
  return F.node(done => {
    let count = 0;
    const stream = fs.createReadStream(path);
    stream.on("error", err => done(err));
    stream.on("data", buf => {
      count += countLinesOfBuffer(buf);
    });
    stream.on("end", () => done(null, count));
  });
}

function countLinesOfFiles(dir, files) {
  return F.parallel(32, files.map(filename => {
    const path = npath.join(dir, filename);
    return countLinesOfFile(path).chainRej(showError(path, 0));
  })).map(sum(num => num)).map(sumOfLineCounts => {
    return {
      fileCount: files.length,
      lineCount: sumOfLineCounts
    };
  });
}

function countLinesOfSubdirs(dir, subdirs) {
  return F.parallel(1, subdirs.map(dirname => {
    const path = npath.join(dir, dirname);
    return countLinesOfDir(path);
  })).map(counts => {
    return {
      fileCount: sum(R.prop("fileCount"), counts),
      lineCount: sum(R.prop("lineCount"), counts)
    };
  });
}

function splitFilesAndDirs(dir, names) {
  return F.parallel(32, names.map(name => {
    const path = npath.join(dir, name);
    return isDir(path).chainRej(showError(path, null));
  })).map(flags => {
    // We intentionally use `===` for boolean here to filter out `null`.
    return {
      files: names.filter((name, idx) => flags[idx] === false),
      subdirs: names.filter((name, idx) => flags[idx] === true)
    };
  });
}

function countLinesOfDir(dir) {
  return readDir(dir).chain(names => {
    return splitFilesAndDirs(dir, names).chain(({files, subdirs}) => {
      return countLinesOfFiles(dir, files).chain(filesInfo => {
        return countLinesOfSubdirs(dir, subdirs).map(dirsInfo => {
          return {
            fileCount: filesInfo.fileCount + dirsInfo.fileCount,
            lineCount: filesInfo.lineCount + dirsInfo.lineCount
          };
        });
      });
    });
  }).map(info => {
    console.log(`${dir} = ${info.fileCount} files, ${info.lineCount} lines`);
    return info;
  }).chainRej(showError(dir, {fileCount: 0, lineCount: 0}));
}

module.exports = countLinesOfDir;
