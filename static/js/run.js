
var socket = io("http://localhost:5050");
Dropzone.autoDiscover = false;
$(document).ready(function() {

    socket.on("output", (output) => {
        let str = output.replace(/(?:\r\n|\r|\n)/g, '<br>');
        $("#output").html((index, oldcontent) => {
            return oldcontent + str;
        });
    });

    $("#dropzone").dropzone({
        autoProcessQueue: false,
        url: 'upload_files.php',
        init: function () {

            var myDropzone = this;

            // Update selector to match your button
            $("#dropzoneSubmit").click(function (e) {
                e.preventDefault();
                socket.emit('submit', {
                    filename: myDropzone.files[0].name,
                    data: myDropzone.files[0],
                });
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
    socket.emit('submit', 'run.py');
}

function submitJava() {
    socket.emit('submit', 'run.java');
}

function submitCPP() {
    socket.emit('submit', 'run.cpp');
}
