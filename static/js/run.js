
var socket;
Dropzone.autoDiscover = false;
$(document).ready(function() {
    socket = new WebSocket('ws://localhost:5050');

    socket.onmessage = function(message) {
        let str = message.data.replace(/(?:\r\n|\r|\n)/g, '<br>');
        $("#output").html((index, oldcontent) => {
            return oldcontent + str;
        });
    }

    $("#dropzone").dropzone({
        autoProcessQueue: false,
        url: 'upload_files.php',
        init: function () {

            var myDropzone = this;

            // Update selector to match your button
            $("#dropzoneSubmit").click(function (e) {
                e.preventDefault();
                console.log(myDropzone.files[0]);
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
    socket.send('run.py');
}

function submitJava() {
    socket.send('run.java');
}

function submitCPP() {
    socket.send('run.cpp');
}
