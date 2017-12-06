"use strict";

const countLinesOfDir = require("./lineCounterPromise");

countLinesOfDir(process.argv[2] || ".");
