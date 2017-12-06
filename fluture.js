"use strict";

const countLinesOfDir = require("./lineCounterFluture");

countLinesOfDir(process.argv[2] || ".").fork(console.error, console.log);
