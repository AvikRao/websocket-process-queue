
var socket;

$(document).ready(function() {
    socket = new WebSocket('ws://localhost:5050');

    socket.onmessage = function(message) {
        let str = message.data.replace(/(?:\r\n|\r|\n)/g, '<br>');
        $("#output").html((index, oldcontent) => {
            return oldcontent + str;
        });
    }

});

function submit() {
    socket.send('Hello!');
}
