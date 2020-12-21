// Imports
const express = require('express');
const app = express();
const { v4: uuidv4 } = require("uuid");
const EventEmitter = require("events");
const async = require('async');
const spawn = require("child_process");
const fs = require('fs');
const path = require('path');
const io = require('socket.io')(5050, {
    cors: {
        origin: "http://localhost:8080",
        methods: ["GET", "POST"]
    }
});

// Global variables, set as necessary
const CONCURRENCY = 5;
const TIMEOUT = 60;
const SCRIPT_DIR = "scripts/";

// Emitter for asynchronous events when running files
const processEmitter = new EventEmitter();

// Express basics
app.set('port', process.env.PORT || 8080);
app.use(express.static('static'));
// Serve socket.io files to client without giving direct access to /node_modules/
app.use('/socket.io', express.static(__dirname + '/node_modules/socket.io/client-dist')); 

let listener = app.listen(app.get('port'), function () {
    console.log('Express server started on port: ' + listener.address().port);
});


// Queue workhorse block
var processOutputs = {}; // Maps process_id -> output of process
var queue = async.queue(async function (obj, callback) {
    io.to(obj.client_id).emit("system", `Starting process ${obj.process_id}...\n`); // alert client that queue has reached this process and is starting
    let output = await runFile(obj.filename, obj.directory, obj.process_id, obj.client_id); // runs the file and gets the output
    processOutputs[obj.process_id] = output; // stores output for future retrieval if necessary

    // If the subdirectory was created by the process (AKA this process is not a testing file in the testing folder), delete the subdirectory
    if (obj.directory != "testing") {
        fs.rmdirSync(obj.directory, {recursive: true});
    }
    callback();
}, CONCURRENCY); // how many processes to allow in parallel

// resolves promise after TIMEOUT seconds have passed
async function timeout(process_id) {
    return new Promise((resolve) => {
        let wait = setTimeout(() => {
            clearTimeout(wait);
            resolve("timeout");
        }, TIMEOUT*1000);
    });
}

// resolves promise if the emitter emits this process_id (aka once the file is done running)
async function success(process_id) {
    return new Promise((resolve) => {
        processEmitter.once(process_id, () =>{
            resolve("success");
        })
    });
}

// file execution workhorse function
async function runFile(filename, directory, process_id, client_id) {
    let extension = filename.match(/\..+$/)[0]; // grabs file extension
    let str = ''; // output string

    // If Python
    if (extension == ".py") {

        // Runs file in python 3.8 with option u (NECESSARY in order to retrieve stdout)
        let pythonProcess = spawn.spawn('python3.8', ['-u', filename], {cwd: directory});

        // reports any output to the client, adds to output string
        pythonProcess.stdout.on('data', (data) => {
            str += data.toString();
            io.to(client_id).emit('output', data.toString());
        });

        // reports any errors to the client, adds to output string
        pythonProcess.stderr.on('data', (data) => {
            str += data.toString();
            io.to(client_id).emit('error', data.toString());
        });

        // tells the emitter to emit this process_id once the file has finished running
        pythonProcess.on('close', (code) => {
            processEmitter.emit(process_id);
        });

        // Wait for either successful execution or a timeout
        let exitStatus = await Promise.race([timeout(process_id), success(process_id)]);

        // If successful, tell the client that this process ended without server errors (THERE COULD BE EXECUTION ERRORS, but unimportant)
        if (exitStatus == "success") {
            console.log(`Process ${process_id} completed successfully.`);
            io.to(client_id).emit("success", `Process ${process_id} complete.\n`);
        
        // If timed out, tell the client that it timed out
        } else if (exitStatus == "timeout") {
            console.log(`Process ${process_id} timed out.`);
            io.to(client_id).emit("timeout", `Process ${process_id} timed out.\n`);
        }

        // kill the process to save memory and return the output
        pythonProcess.kill();
        return str;

    // If Java
    } else if (extension == ".java") {

        // Check for compilation errors
        let compileErrors = false;

        // Compile the .java file
        let javaCompile = spawn.spawn('javac', [filename], {cwd: directory});

        // Report any compilation output to client, add to output string (this is a formality, I don't think Java has any output when compiling)
        javaCompile.stdout.on('data', (data) => {
            str += data.toString();
            io.to(client_id).emit('output', data.toString());
        });

        // Report any compilation errors to client, add to output string, set compileErrors to true
        javaCompile.stderr.on('data', (data) => {
            compileErrors = true;
            str += data.toString();
            io.to(client_id).emit('error', data.toString());
        });

        // Tell emitter to emit this process_id once done compiling
        javaCompile.on('close', (code) => {
            processEmitter.emit(process_id);
        });

        // Wait for successful compilation process or timeout, then kill the process to save memory
        let exitStatus = await Promise.race([timeout(process_id), success(process_id)]);
        javaCompile.kill();

        // If there were no compilation errors, run the .class file
        if (!compileErrors) {
            
            // Run the .class file, remember that java uses the format "java filename" and not "java filename.class" for executing bytecode
            let javaProcess = spawn.spawn('java', [filename.match(/(.+)\.java$/)[1]], {cwd: directory});

            // reports any output to the client, adds to output string
            javaProcess.stdout.on('data', (data) => {
                str += data.toString();
                io.to(client_id).emit('output', data.toString());
            });

            // reports any errors to the client, adds to output string
            javaProcess.stderr.on('data', (data) => {
                str += data.toString();
                io.to(client_id).emit('error', data.toString());
            });

            // tells the emitter to emit this process_id once the file has finished running
            javaProcess.on('close', (code) => {
                processEmitter.emit(process_id);
            });

            // Wait for either successful execution or a timeout, then kill the process to save memory
            exitStatus = await Promise.race([timeout(process_id), success(process_id)]);
            javaProcess.kill();
        }

        // If successful, tell the client that this process ended without server errors (THERE COULD BE COMPILATION/EXECUTION ERRORS, but unimportant)
        if (exitStatus == "success") {
            console.log(`Process ${process_id} completed successfully.`);
            io.to(client_id).emit("success", `Process ${process_id} complete.\n`);

        // If timed out, tell the client that it timed out
        } else if (exitStatus == "timeout") {
            console.log(`Process ${process_id} timed out.`);
            io.to(client_id).emit("timeout", `Process ${process_id} timed out.\n`);
        }

        // return output
        return str;

    // If C++
    } else if (extension == ".cpp") {

        // Check for compilation errors
        let compileErrors = false;

        // Compile the .cpp file, option o is NECESSARY to avoid getting default "a.out" filename 
        let cppCompile = spawn.spawn('g++', ['-o', `${filename.match(/(.+)\.cpp$/)[1]}.out`, filename], {cwd: directory});

        // Report any compilation output to client, add to output string (this is a formality, I don't think C++ has any output when compiling)
        cppCompile.stdout.on('data', (data) => {
            str += data.toString();
            io.to(client_id).emit('output', data.toString());
        });

        // Report any compilation errors to client, add to output string, set compileErrors to true
        cppCompile.stderr.on('data', (data) => {
            compileErrors = true;
            str += data.toString();
            io.to(client_id).emit('error', data.toString());
        });

        // Tell emitter to emit this process_id once done compiling
        cppCompile.on('close', (code) => {
            processEmitter.emit(process_id);
        });

        // Wait for successful compilation process or timeout, then kill the process to save memory
        let exitStatus = await Promise.race([timeout(process_id), success(process_id)]);
        cppCompile.kill();

        // If there were no compilation errors, run the .out file
        if (!compileErrors) {

            // Run the .class file; unlike Java, C++ DOES use the file extension so "./filename.out" is correct and "./filename" is not
            let cppProcess = spawn.execFile(`./${filename.match(/(.+)\.cpp$/)[1]}.out`, [], {cwd: directory}, (error, stdout, stderr) => {

                // Tells the emitter to emit this process_id once the file has finished running
                processEmitter.emit(process_id);

                // If there was an error in node.js's ability to spawn this process, report it to the client 
                if (error) {
                    io.to(client_id).emit('error', error.toString());
                }

                // Report any output and errors to the client, then adds them to the output string
                io.to(client_id).emit('error', stderr.toString());
                io.to(client_id).emit('output', stdout.toString() + '\n');
                str += stdout.toString() + stderr.toString();
            })

            // Wait for either successful execution or a timeout, then kill the process to save memory
            exitStatus = await Promise.race([timeout(process_id), success(process_id)]);
            cppProcess.kill();
        }
        
        // If successful, tell the client that this process ended without server errors (THERE COULD BE COMPILATION/EXECUTION ERRORS, but unimportant)
        if (exitStatus == "success") {
            console.log(`Process ${process_id} completed successfully.`);
            io.to(client_id).emit("success", `Process ${process_id} complete.\n`);

        // If timed out, tell the client that it timed out
        } else if (exitStatus == "timeout") {
            console.log(`Process ${process_id} timed out.`);
            io.to(client_id).emit("timeout", `Process ${process_id} timed out.\n`);
        }
        
        // return output
        return str;
    }
}

// When a client connects to the websocket (aka, when someone opens the page in their browser)
io.on('connection', (socket) => {

    // Log it
    console.log(`Someone has connected to the websocket with id ${socket.id}`);

    // When client submits code
    socket.on('submit', (data) => {

        // Create a new, universally unique ID for the process and create a new subdirectory path with this ID to contain it
        let process_id = uuidv4();
        let process_dir = path.join(SCRIPT_DIR, process_id);

        // If the uploaded file has data, create the subdirectory and store the file in this subdirectory
        if (data.data != null) {
            fs.mkdirSync(process_dir);
            fs.writeFileSync(path.join(process_dir, data.filename), data.data);

        // TESTING: default to the default "testing" directory (doesn't exist in tjcss)
        } else {
            process_dir = path.join(SCRIPT_DIR, "testing");
        }

        // Add the process to the queue
        queue.push({ filename: data.filename, directory: process_dir, process_id: process_id, client_id: socket.id });

        // Report to client that their file has been added to the queue and is waiting to be processed.
        console.log(`Connection ${socket.id} has added process ${process_id} to the queue.`);
        socket.emit("system", `Process ${process_id} has been created and added to the queue at position ${queue.length()}\n`);
    });
});

// Serve html file to clients 
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, "run.html"));
});

