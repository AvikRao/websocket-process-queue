
var socket;

$(document).ready(function() {
    socket = new WebSocket('ws://localhost:5050');

    socket.onmessage = function(message) {
        $(".content").append(`<p>${message.data}</p>`)
    }

});

function submit() {
    socket.send('Hello!');
}
