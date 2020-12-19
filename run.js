let express = require('express');
const hbs = require('hbs');
const WebSocket = require('ws');
const { v4: uuidv4 } = require("uuid");
const { c, cpp, node, python, java } = require('compile-run');
const EventEmitter = require("events");
const async = require('async');
var spawn = require("child_process");

const CONCURRENCY = 10;
const TIMEOUT = 60;

const app = express();
const wss = new WebSocket.Server({ port: 5050 });

const emitter = new EventEmitter();
const processEmitter = new EventEmitter();

app.set('port', process.env.PORT || 8080);
app.set('view engine', 'hbs');
app.use(express.static('static'));

let listener = app.listen(app.get('port'), function () {
    console.log('Express server started on port: ' + listener.address().port);
});

var processOutputs = {};
var queue = async.queue(async function (obj, callback) {
    let r = await runFile(obj.filename, obj.process_id, obj.client_id);
    console.log(r);
    processOutputs[obj.process_id] = r;
    emitter.emit(obj.process_id);
    callback();
}, CONCURRENCY);

async function timeout(process_id) {
    setTimeout(() => {
        processEmitter.emit(process_id);
    }, TIMEOUT*1000);
}

async function runFile(filename, process_id, client_id) {
    let str = '';
    let pythonProcess = spawn.spawn('python3.8', ['-u', filename, "./puzzles.txt"]);
    timeout(process_id);
    pythonProcess.stdout.on('data', (data) => {
        ws_lookup[client_id].send(data.toString());
        str += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        console.log(data);
        str += data.toString();
    });

    pythonProcess.on('close', (code) => {
        processEmitter.emit(process_id);
    });

    await new Promise(resolve => processEmitter.once(process_id, resolve)); 
    return str;
}

var ws_lookup = {};
wss.on('connection', async function connection(ws) {

    console.log("Someone has connected to the websocket!");
    
    let client_id = uuidv4();
    ws.id = client_id;
    ws_lookup[ws.id] = ws;

    ws.on('message', async function incoming(message) {

        let process_id = uuidv4();
        queue.push({ filename: "./slider.py", process_id: process_id, client_id: client_id});
        console.log(`Websocket ${ws.id} has received a message! Added new process ${process_id} to queue at position ${queue.length() - 1}`);

        // await new Promise(resolve => emitter.once(process_id, resolve));
        // ws.send(processOutputs[process_id]);

    });

});

app.get('/', (req, res) => {
    res.render("run");
});

