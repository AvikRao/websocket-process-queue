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

const CONCURRENCY = 10;
const TIMEOUT = 5;
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
    let r = await runFile(SCRIPT_DIR + obj.filename, obj.process_id, obj.client_id);
    processOutputs[obj.process_id] = r;
    emitter.emit(obj.process_id);
    callback();
}, CONCURRENCY);

async function timeout(process_id) {
    // setTimeout(() => {
    //     processEmitter.emit(process_id);
    // }, TIMEOUT*1000);
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

// async function cppExecute(filename, process_id, client_id) {
//     let { stdout, stderr } = await exec(`./${filename.match(/(.+)\.cpp$/)[1]}.out`);
//     io.to(client_id).emit('output', stdout.toString() + stderr.toString() + '\n');
//     processEmitter.emit(process_id);
// }

async function cppTimeout(process_id) {
    setTimeout(() => {
        processEmitter.emit(process_id);
    }, TIMEOUT*1000);
}

async function runFile(filename, process_id, client_id) {
    let extension = filename.match(/\..+$/)[0];
    let str = '';
    if (extension == ".py") {
        let pythonProcess = spawn.spawn('python3.8', ['-u', filename, "./puzzles.txt"]);
        // timeout(process_id);
        pythonProcess.stdout.on('data', (data) => {
            io.to(client_id).emit('output', data.toString());
        });

        pythonProcess.stderr.on('data', (data) => {
            console.log(data.toString());
            io.to(client_id).emit('output', data.toString());
        });

        pythonProcess.on('close', (code) => {
            processEmitter.emit(process_id);
        });


        let exitStatus = await Promise.race([timeout(process_id), success(process_id)]);
        if (exitStatus == "success") {
            console.log(`Process ${process_id} completed successfully.`);
        } else if (exitStatus == "timeout") {
            console.log(`Process ${process_id} timed out.`);
        }

        pythonProcess.kill();
        return str;

    } else if (extension == ".java") {
    
        timeout(process_id);
        let {stdout, stderr} = await exec(`javac ${filename}`);
        io.to(client_id).emit('output', stdout.toString() + stderr.toString()); 

        let javaProcess = spawn.spawn('java', [filename.match(/(.+)\.java$/)[1]]);

        javaProcess.stdout.on('data', (data) => {
            io.to(client_id).emit('output', data.toString());
        });

        javaProcess.stderr.on('data', (data) => {
            io.to(client_id).emit('output', data.toString());
        });

        javaProcess.on('close', (code) => {
            processEmitter.emit(process_id);
        });

        let exitStatus = await Promise.race([timeout(process_id), success(process_id)]);
        if (exitStatus == "success") {
            console.log(`Process ${process_id} completed successfully.`);
        } else if (exitStatus == "timeout") {
            console.log(`Process ${process_id} timed out.`);
        }

        javaProcess.kill();
        return str;

    } else if (extension == ".cpp") {
        // timeout(process_id);
        let { stdout, stderr } = await exec(`g++ -o ${filename.match(/(.+)\.cpp$/)[1]}.out ${filename}`);
        io.to(client_id).emit('output', stdout.toString() + stderr.toString());

        let exitcode = '';

        let cppProcess = spawn.execFile(`${filename.match(/(.+)\.cpp$/)[1]}.out`, [], (error, stdout, stderr) => {
            processEmitter.emit(process_id);
            io.to(client_id).emit('output', stdout.toString() + stderr.toString() + '\n');
        })

        let exitStatus = await Promise.race([timeout(process_id), success(process_id)]);
        if (exitStatus == "success") {
            console.log(`Process ${process_id} completed successfully.`);
        } else if (exitStatus == "timeout") {
            console.log(`Process ${process_id} timed out.`);
        }
        cppProcess.kill();
        return str;
    }
}

io.on('connection', (socket) => {

    console.log(`Someone has connected to the websocket with id ${socket.id}`);

    // handle the event sent with socket.send()
    socket.on('submit', (data) => {
        let process_id = uuidv4();
        if (data.data != null) {
            fs.writeFileSync(SCRIPT_DIR + data.filename, data.data);
        }
        queue.push({ filename: data.filename, process_id: process_id, client_id: socket.id });
        console.log(`Connection ${socket.id} has added process ${process_id} to the queue.`);
    });
});

app.get('/', (req, res) => {
    res.render("run");
});

