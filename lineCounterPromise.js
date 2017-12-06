"use strict";

const fs = require("fs");
const npath = require("path");
const promisify = require("promise-box/lib/promisify");
const queue = require("promise-box/lib/queue");

const readDirP = promisify(fs.readdir);
const statP = promisify(fs.stat);

function errorToString(err) {
  return err.message;
}

function isDir(path) {
  return statP(path).then(stats => stats.isDirectory());
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
  return new Promise((resolve, reject) => {
    let count = 0;
    const stream = fs.createReadStream(path);
    stream.on("error", reject);
    stream.on("data", buf => {
      count += countLinesOfBuffer(buf);
    });
    stream.on("end", () => {
      resolve(count);
    });
  });
}

function countLinesOfFiles(dir, files) {
  let sumOfLineCounts = 0;
  return queue({data: files, concurrency: 32}).run(filename => {
    const path = npath.join(dir, filename);
    return countLinesOfFile(path).catch(err => {
      console.error(`${path}: ${errorToString(err)}`);
      return 0;
    }).then(count => {
      sumOfLineCounts += count;
    });
  }).then(() => {
    return {
      fileCount: files.length,
      lineCount: sumOfLineCounts
    };
  });
}

function countLinesOfSubdirs(dir, subdirs) {
  let fileCount = 0, lineCount = 0;
  let promise = Promise.resolve();
  subdirs.forEach(dirname => {
    promise = promise.then(() => {
      const path = npath.join(dir, dirname);
      return countLinesOfDir(path).then(info => {
        fileCount += info.fileCount;
        lineCount += info.lineCount;
      });
    });
  });
  return promise.then(() => {
    return {fileCount, lineCount};
  });
}

function splitFilesAndDirs(dir, names) {
  const flags = Array(names.length);
  let idx = 0;
  return queue({data: names, concurrency: 32}).run(name => {
    const path = npath.join(dir, name);
    const myIndex = idx++;
    return isDir(path).catch(err => {
      console.error(`${path}: ${errorToString(err)}`);
      return null;
    }).then(flag => {
      flags[myIndex] = flag;
    });
  }).then(() => {
    // We intentionally use `===` for boolean here to filter out `null`.
    return {
      files: names.filter((name, idx) => flags[idx] === false),
      subdirs: names.filter((name, idx) => flags[idx] === true)
    };
  });
}

function countLinesOfDir(dir) {
  return readDirP(dir).then(names => {
    return splitFilesAndDirs(dir, names).then(({files, subdirs}) => {
      return countLinesOfFiles(dir, files).then(filesInfo => {
        return countLinesOfSubdirs(dir, subdirs).then(dirsInfo => {
          return {
            fileCount: filesInfo.fileCount + dirsInfo.fileCount,
            lineCount: filesInfo.lineCount + dirsInfo.lineCount
          };
        });
      });
    });
  }).then(info => {
    console.log(`${dir} = ${info.fileCount} files, ${info.lineCount} lines`);
    return info;
  }, err => {
    console.error(`${dir} = ${errorToString(err)}`);
    return {fileCount: 0, lineCount: 0};
  });
}

module.exports = countLinesOfDir;
