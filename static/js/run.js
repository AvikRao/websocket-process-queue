var socket = io("http://localhost:5050");
Dropzone.autoDiscover = false;
$(document).ready(function() {

    socket.on("output", (output) => {
        let parsed = output.split(/\n/);
        for (let line of parsed) {
            $('<div class="stdout"/>').text(line).appendTo(".output");
        }
    });

    socket.on("system", (output) => {
        let parsed = output.split(/\n/);
        for (let line of parsed) {
            $('<div class="system"/>').text(line).appendTo(".output");
        }
    });

    socket.on("error", (output) => {
        let parsed = output.split(/\n/);
        for (let line of parsed) {
            $('<div class="error"/>').text(line).appendTo(".output");
        }
    });

    socket.on("success", (output) => {
        let parsed = output.split(/\n/);
        for (let line of parsed) {
            $('<div class="success"/>').text(line).appendTo(".output");
        }
        $(".output").append("<br>");
    });

    socket.on("timeout", (output) => {
        let parsed = output.split(/\n/);
        for (let line of parsed) {
            $('<div class="timeout"/>').text(line).appendTo(".output");
        }
        $(".output").append("<br>");
    });

    $("#dropzone").dropzone({
        autoProcessQueue: false,
        url: 'upload_files.php',
        init: function () {

            var myDropzone = this;

            // Update selector to match your button
            $("#dropzoneSubmit").click(function (e) {
                e.preventDefault();
                $(".output").append("<br>");
                socket.emit('submit', {
                    filename: myDropzone.files[0].name,
                    data: myDropzone.files[0],
                });
                myDropzone.removeAllFiles();
            });

            this.on('sending', function (file, xhr, formData) {
                // Append all form inputs to the formData Dropzone will POST
                var data = $('#frmTarget').serializeArray();
                $.each(data, function (key, el) {
                    formData.append(el.name, el.value);
                });
            });
        }
    });

});

function submitPython() {
    socket.emit('submit', {
        filename: "run.py",
        data: null,
    });
}

function submitJava() {
    socket.emit('submit', {
        filename: "run.java",
        data: null,
    });
}

function submitCPP() {
    socket.emit('submit', {
        filename: "run.cpp",
        data: null,
    });
}
