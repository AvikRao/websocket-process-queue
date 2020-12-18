let express = require('express');
const hbs = require('hbs');
const WebSocket = require('ws');
const { v4: uuidv4 } = require("uuid");
const { c, cpp, node, python, java } = require('compile-run');
const EventEmitter = require("events");
const async = require('async');

const CONCURRENCY = 10;

const app = express();
const wss = new WebSocket.Server({ port: 5050 });

const emitter = new EventEmitter();

app.set('port', process.env.PORT || 8081);
app.set('view engine', 'hbs');
app.use(express.static('static'));

let listener = app.listen(app.get('port'), function () {
    console.log('Express server started on port: ' + listener.address().port);
});

var processOutputs = {};
var queue = async.queue(async function (obj, callback) {
    let r = await runPython(obj.filename);
    processOutputs[obj.id] = r + ' ' + obj.id;
    console.log(r);
    emitter.emit(obj.id);
    callback();
}, CONCURRENCY);

async function runPython(filename) {
    let str = '';
    let pPromise = await python.runFile(filename, { stdin: "EJCAFD_HNOBKIMGL", timeout: 60000, executionPath: "python3.8" });
    str += pPromise.stderr;
    if (str.length > 0)
        str += '<br><br>';
    for (let element of pPromise.stdout) {
        if (element.indexOf("\n") != -1) {
            str += '<br>';
        } else {
            str += element;
        }
    }
    return str.replace(/[\r]+/g, '');
}

var ws_lookup = {};
wss.on('connection', async function connection(ws) {

    console.log("Someone has connected to the websocket!");
    
    let id = uuidv4();
    ws.id = id;
    ws_lookup[ws.id] = ws;

    ws.on('message', async function incoming(message) {

        console.log(`Websocket ${ws.id} has received a message!`);

        queue.push({ filename: "run.py", id: ws.id });
        await new Promise(resolve => emitter.once(id, resolve));
        ws.send(processOutputs[id]);
    });

});

app.get('/', (req, res) => {
    res.render("run");
});

