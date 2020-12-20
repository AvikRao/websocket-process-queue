const express = require('express');
const app = express();
const { v4: uuidv4 } = require("uuid");
const EventEmitter = require("events");
const async = require('async');
const spawn = require("child_process");
const util = require('util');
const exec = util.promisify(spawn.exec);
const fs = require('fs');
const io = require('socket.io')(5050, {
    cors: {
        origin: "http://localhost:8080",
        methods: ["GET", "POST"]
    }
});

const CONCURRENCY = 5;
const TIMEOUT = 60;
const SCRIPT_DIR = "scripts/";

const emitter = new EventEmitter();
const processEmitter = new EventEmitter();

app.set('port', process.env.PORT || 8080);
app.set('view engine', 'hbs');
app.use(express.static('static'));
app.use('/socket.io', express.static(__dirname + '/node_modules/socket.io/client-dist'));

let listener = app.listen(app.get('port'), function () {
    console.log('Express server started on port: ' + listener.address().port);
});

var processOutputs = {};
var queue = async.queue(async function (obj, callback) {
    io.to(obj.client_id).emit("system", `Starting process ${obj.process_id}...\n`);
    let output = await runFile(SCRIPT_DIR + obj.filename, obj.process_id, obj.client_id);
    processOutputs[obj.process_id] = output;
    emitter.emit(obj.process_id);
    callback();
}, CONCURRENCY);

async function timeout(process_id) {
    return new Promise((resolve) => {
        let wait = setTimeout(() => {
            clearTimeout(wait);
            resolve("timeout");
        }, TIMEOUT*1000);
    });
}

async function success(process_id) {
    return new Promise((resolve) => {
        processEmitter.once(process_id, () =>{
            resolve("success");
        })
    });
}

async function runFile(filename, process_id, client_id) {
    let extension = filename.match(/\..+$/)[0];
    let str = '';
    if (extension == ".py") {

        let pythonProcess = spawn.spawn('python3.8', ['-u', filename]);

        pythonProcess.stdout.on('data', (data) => {
            str += data.toString();
            io.to(client_id).emit('output', data.toString());
        });

        pythonProcess.stderr.on('data', (data) => {
            str += data.toString();
            io.to(client_id).emit('error', data.toString());
        });

        pythonProcess.on('close', (code) => {
            processEmitter.emit(process_id);
        });


        let exitStatus = await Promise.race([timeout(process_id), success(process_id)]);
        if (exitStatus == "success") {
            console.log(`Process ${process_id} completed successfully.`);
            io.to(client_id).emit("success", `Process ${process_id} complete.\n`);
        } else if (exitStatus == "timeout") {
            console.log(`Process ${process_id} timed out.`);
            io.to(client_id).emit("timeout", `Process ${process_id} timed out.\n`);
        }

        pythonProcess.kill();
        return str;

    } else if (extension == ".java") {

        let compileErrors = false;

        let javaCompile = spawn.spawn('javac', [filename]);

        javaCompile.stdout.on('data', (data) => {
            str += data.toString();
            io.to(client_id).emit('output', data.toString());
        });

        javaCompile.stderr.on('data', (data) => {
            compileErrors = true;
            str += data.toString();
            io.to(client_id).emit('error', data.toString());
        });

        javaCompile.on('close', (code) => {
            processEmitter.emit(process_id);
        });

        let exitStatus = await Promise.race([timeout(process_id), success(process_id)]);
        javaCompile.kill();

        if (!compileErrors) {
            
            let javaProcess = spawn.spawn('java', ['-cp', __dirname + '/' + SCRIPT_DIR, filename.match(/(.+)\.java$/)[1].slice(SCRIPT_DIR.length)]);

            javaProcess.stdout.on('data', (data) => {
                str += data.toString();
                io.to(client_id).emit('output', data.toString());
            });

            javaProcess.stderr.on('data', (data) => {
                str += data.toString();
                io.to(client_id).emit('error', data.toString());
            });

            javaProcess.on('close', (code) => {
                processEmitter.emit(process_id);
            });

            exitStatus = await Promise.race([timeout(process_id), success(process_id)]);
            javaProcess.kill();
        }

        if (exitStatus == "success") {
            console.log(`Process ${process_id} completed successfully.`);
            io.to(client_id).emit("success", `Process ${process_id} complete.\n`);
        } else if (exitStatus == "timeout") {
            console.log(`Process ${process_id} timed out.`);
            io.to(client_id).emit("timeout", `Process ${process_id} timed out.\n`);
        }

        return str;

    } else if (extension == ".cpp") {

        let compileErrors = false;

        let cppCompile = spawn.spawn('g++', ['-o', `${filename.match(/(.+)\.cpp$/)[1]}.out`, filename]);

        cppCompile.stdout.on('data', (data) => {
            str += data.toString();
            io.to(client_id).emit('output', data.toString());
        });

        cppCompile.stderr.on('data', (data) => {
            compileErrors = true;
            str += data.toString();
            io.to(client_id).emit('error', data.toString());
        });

        cppCompile.on('close', (code) => {
            processEmitter.emit(process_id);
        });

        let exitStatus = await Promise.race([timeout(process_id), success(process_id)]);
        cppCompile.kill();

        if (!compileErrors) {
            let cppProcess = spawn.execFile(`${filename.match(/(.+)\.cpp$/)[1]}.out`, [], (error, stdout, stderr) => {
                processEmitter.emit(process_id);
                io.to(client_id).emit('error', stderr.toString());
                io.to(client_id).emit('output', stdout.toString() + '\n');
                str += stdout.toString() + stderr.toString();
            })
            exitStatus = await Promise.race([timeout(process_id), success(process_id)]);
            cppProcess.kill();
        }
        
        if (exitStatus == "success") {
            console.log(`Process ${process_id} completed successfully.`);
            io.to(client_id).emit("success", `Process ${process_id} complete.\n`);
        } else if (exitStatus == "timeout") {
            console.log(`Process ${process_id} timed out.`);
            io.to(client_id).emit("timeout", `Process ${process_id} timed out.\n`);
        }
        
        return str;
    }
}

io.on('connection', (socket) => {

    console.log(`Someone has connected to the websocket with id ${socket.id}`);

    socket.on('submit', (data) => {
        let process_id = uuidv4();
        if (data.data != null) {
            fs.writeFileSync(SCRIPT_DIR + data.filename, data.data);
        }
        queue.push({ filename: data.filename, process_id: process_id, client_id: socket.id });
        console.log(`Connection ${socket.id} has added process ${process_id} to the queue.`);
        socket.emit("system", `Process ${process_id} has been created and added to the queue at position ${queue.length()}\n`);
    });
});

app.get('/', (req, res) => {
    res.render("run");
});

