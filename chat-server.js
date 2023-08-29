// Require the packages we will use:
const http = require("http"),
    fs = require("fs");

const port = 3456;
const file = "client.html";
// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html, on port 3456:
const server = http.createServer(function (req, res) {
    // This callback runs when a new connection is made to our HTTP server.

    fs.readFile(file, function (err, data) {
        // This callback runs when the client.html file has been read from the filesystem.

        if (err) return res.writeHead(500);
        res.writeHead(200);
        res.end(data);
    });
});
server.listen(port);

// Import Socket.IO and pass our HTTP server object to it.
const socketio = require("socket.io")(http, {
    wsEngine: 'ws'
});
//holding all our current users in an array
let currentUsernames = new Array();
let userObjs = new Array();
let chatrooms = ["lobby"];
let room_name_map = new Map;
let room_password_map = new Map;
let room_banned_map = new Map;
room_password_map.set("lobby","");
let room_creator_map = new Map;
// Attach our Socket.IO server to our HTTP server to listen
const io = socketio.listen(server);
io.sockets.on("connection", function (socket) {
    // This callback runs when a new Socket.IO connection is established.

    socket.on('message_to_server', function (data) {
        // This callback runs when the server receives a new message from the client.
        let currentRoom = null;
        let currentUser = socket.username;
        for(let [key, value] of room_name_map){
            if(key == currentUser){
                currentRoom = value;
            }
        }
        
        io.in(currentRoom).emit("message_to_client", { message: currentUser + ": " + data["message"] });
    });
    //private_message_to_server
    socket.on('private_message_to_server', function (data) {
        let currentUser = socket.username;
       
        let receiver = data["person"];
     
        let receiverId = null;
        let message = data["message"];
        for (let i in userObjs){
            if (userObjs[i].name == receiver){

                receiverId = userObjs[i].id;
               
            }
        }
        if (receiverId!=null){
            let socketTo=io.sockets.sockets.get(receiverId);
            socketTo.emit("message_to_client", { message: "Private message from "+ socket.username + " : " + data["message"] });
        }
        else{
            let socketTo=io.sockets.sockets.get(socket.id);
            socketTo.emit("user_not_found", {message: "could not find the user"});
        }
        
    });
    socket.on('user_to_server', function(data) {
        //setting our instance username 
        let canJoin = true;
        for (let i in userObjs){
            if (userObjs[i].name == data["user"]){
                canJoin = false;
                let socketTo=io.sockets.sockets.get(socket.id);
                socketTo.emit("existingUser", {message: "another user exists in the chat with that nickname - please pick another"})
            }
        }
        if (canJoin){
            socket.username  = data["user"];
            //creating a new user object for the socket
            const userObject = {name: data["user"], id: socket.id, room: "lobby"};
            
            userObjs.push(userObject);
            socket.room = "lobby";
            //adding it to our current usernames array
            currentUsernames.push(socket.username);
            //putting them in the lobby
            socket.join("lobby");
            //adding room they are in to username map
            room_name_map.set(socket.username,socket.room);
            
            io.sockets.in("lobby").emit("newUser", {message: socket.username}) //sending the entire uesr list over 
        }
        
    });
    
    socket.on('new_room_info', function(data) {
        chatrooms.push(data["newRoomName"]);
        //using a map to set the user id of the current user to the new roo name
        room_creator_map.set(data["newRoomName"],socket.id);
        
        //setting the password for the map
        room_password_map.set(data["newRoomName"], data["password"]);
        let banned = new Array();
        room_banned_map.set(data["newRoomName"],banned);
        io.sockets.emit("roomList", {message: chatrooms}) //sending the entire uesr list over 
    });
    socket.on('listRooms', function(data) {
        io.sockets.emit("roomListRenew", {message: chatrooms}) //sending the entire uesr list over 
    });

    //joining a room
    socket.on('joined_room', function(data) {
        //adding our room and password data in
       
        
        let joinedRoom = data["joined_room"];
        
        let password = data["password"];
        let exists = false;
        
        //checking if a joined room exists
        for (let i =0; i<chatrooms.length; i = i+1){
            if (joinedRoom==chatrooms[i]){
                exists = true;
            }  
        }
      
        if (!exists){
            let socketTo=io.sockets.sockets.get(socket.id);
            socketTo.emit("could_join", {message: exists})
        }else{
         
        let passwordMatches = false;
        //checking to see if there exists a password or if it is just an empty string
       
        for(let [key, value] of room_password_map){
            
            if(key == joinedRoom && value.length==0){
              
                //if there is no password - we want to let them enter!
              
                passwordMatches = true;
                
            }
            //if there is a password
            else if (key== joinedRoom &&value.length != 0){
                //if password matches
                if (value == password){
                   
                    passwordMatches = true;
                }
                else{
                    //if the password is incorrect and there is a password
                    passwordMatches = false;
                    let socketTo=io.sockets.sockets.get(socket.id);
                    socketTo.emit("passwordIncorrect", {message: false})
                }
            }
            //if we know they can enter
            if (passwordMatches){
                let banned = false;
                for(let [key, value] of room_banned_map){
                    if (key ==joinedRoom){
                        let bannedArr = value;
                        for(let i in bannedArr){
                            if (bannedArr[i] == socket.id){
                                banned = true;
                            }
                    }
                }
                if (!banned){
                    let previous = socket.room;
                   
                    socket.leave(socket.room);
                    socket.join(joinedRoom);
                    
                    for (let j in userObjs){
                        if (userObjs[j].id == socket.id){
                            //if this is the user object we are talking about
                            userObjs[j].room = joinedRoom;
                        }
                    }
                    socket.room = joinedRoom;
                    room_name_map.set(socket.username, joinedRoom);
                  
                    let usersInRoom = "";
                    //iterate through all values of joined room and update the list
                    for(let [key, value] of room_name_map){
                        if(value == joinedRoom){
                            usersInRoom += key +" is in "+ joinedRoom+"<br>";
                        }
                    }
                    io.sockets.in(socket.room).emit('showUsers', {room_now:socket.room, allusers :usersInRoom })
                }
                else{
                    let socketTo=io.sockets.sockets.get(socket.id);
                   
                    socketTo.emit("bannedEntering", {message: "You have been banned from this chatroom"})
                }
            }
                
            }
            
        }}


    });
    socket.on('kick_user', function(data) {
        userKicked = data["userKicked"];
        
        kicker = socket.id;
    
        roomKicked = data["roomKicked"];
     
        let roomExists = false;
        for(let [key, value] of room_creator_map){
            //if in our creator map, the ID matches that of the current socket.id
            if (key ==roomKicked && value ==kicker){
                //send the kicked user to the lobby
                roomExists =true;
                for(let i in userObjs){
                    if(userKicked==userObjs[i].name){
                        userObjs[i].room = "lobby";
                        userObjs[i].inRoom=null;
                        let userID=userObjs[i].id;
                        
                        let socketKicked=io.sockets.sockets.get(userID);
                        socketKicked.leave(socket.room);
                       
                        room_name_map.set(userObjs[i].name, "lobby");
                        
                        let usersInRoom = "";
                        //iterate through all values of joined room and update the list
                        for(let [person, room] of room_name_map){
                            if(room == roomKicked){
                                usersInRoom += person +" is in "+ roomKicked+"<br>";
                            }
                        }
                        
                        socketKicked.emit("successKick",{success:true,message:"You have been kicked out of the chat."});
                        
                        
                        io.sockets.in(roomKicked).emit('showUsers', {room_now:socket.room, allusers :usersInRoom })
                    }
                }
            }
            //if the person is not the room creator
            else if (key == roomKicked && value !=kicker){
                roomExists =true;
                let socketTo=io.sockets.sockets.get(socket.id);
                
                socketTo.emit("kickingError", {message: "You can only kick people out of rooms you created"})
            }
        }
        //if we reach here, the key must not ever equal the roomKicked
        if (!roomExists){
            let socketTo=io.sockets.sockets.get(socket.id);
            socketTo.emit("kickingError", {message: "Error in kicking user - check that user is in the room"})
        }
    });
    socket.on("ban_user",function(data){
        //retrieve current room and who is doing the banning
        let currentRoom = socket.room;
        let banner = socket.id;
        let bannedUserId = null;
        let bannedUser = data["userBanned"];
       
        //retrieve creator of current room
        for(let [key, value] of room_creator_map){
        
            //if we are in the current room and the creater's id matches the current person's id
            if (key == currentRoom && value == banner){
                //we want to first kick out the user from that room
                for (let i in userObjs){
                    if (bannedUser == userObjs[i].name){
                        bannedUserId = userObjs[i].id;
                        
                        let socketBanned=io.sockets.sockets.get(bannedUserId);
                        //kick the user from the chat first
                       
                        socketBanned.leave(currentRoom);
                        userObjs[i].room = "lobby";
                        socketBanned.join("lobby");
                        for (let [person, room] of room_name_map){
                            if (person == userObjs[i].name){
                                room_name_map.set(person, "lobby");
                             
                            }
                        }
                        //send something to the banned receiver
                        socketBanned.emit("banned_receiver",{message:"You have been banned from the chat."});
                        socket.emit("banner_success",{message:"You have successfully banned this user from the chat."});
                        //add to map of banned users
                        for(let [room, bannedArr] of room_banned_map){
                            //find current room in chat rooms array
                            if(room==currentRoom){
                                //adding the user object's id to the banned room
                                bannedArr.push(bannedUserId);
                                
                            }
                        }
                        let usersInRoom = "";
                    //iterate through all values of joined room and update the list
                   
                        for(let [first, second] of room_name_map){
                        if(second == currentRoom){
                            usersInRoom += first +" is in "+ currentRoom+"<br>";
                        }
                    }
                        io.sockets.in(currentRoom).emit('showUsers', {room_now:currentRoom, allusers :usersInRoom })
                    }
                }
            }
            else if (key == currentRoom && value !=banner){
                socket.emit("banner_success",{message:"You can only ban users from rooms you have created"});
            }
        }
       
       
    });
    socket.on("new_mod",function(data){
        let newMod = data["newMod"];
        console.log(newMod);
        let canChange = false;
        let newModId = null;
        for(let [key, value] of room_name_map){
            //if the new mod exists but is not in the room
            if (key == newMod && value != socket.room){
                let socketTo=io.sockets.sockets.get(socket.id);
                socketTo.emit("new_mod_info", { message: "Please choose a mod that is currently in the room" });
            }
            //new mod is in the room
            else if (key == newMod && value == socket.room){
                for (let [room, personID] of room_creator_map){
                    //if 
                    if (socket.room ==room  && socket.id != personID){
                        let socketTo=io.sockets.sockets.get(socket.id);
                        socketTo.emit("new_mod_info", { message: "You may only change the mod if you are currently the mod" });
                    }
                    //if this is the person who is the mod
                    else if (socket.room ==room  && socket.id == personID){
                        canChange = true;
                        

                    }
                }
            }
        }
        if (canChange){
            //getting the new mod's id
            for (let i in userObjs){
                if (userObjs[i].name == newMod){
                    newModId = userObjs[i].id;
                }
            }
            for(let [key, value] of room_creator_map){
                room_creator_map.set(socket.room,newModId);
                let socketTo=io.sockets.sockets.get(socket.id);
                socketTo.emit("new_mod_info", { message: "You have successfully changed the mod" });
                let socketTwo=io.sockets.sockets.get(newModId);
                socketTwo.emit("new_mod_info", {message: "You have been added as the new mod" });
            }

        }
    });
    socket.on("delete",function(data){
        let canChange = false;
        let deletedRoom = data["deletedRoom"];
        for(let [key, value] of room_creator_map){
            //if we are in the current room and this is the owner
            if (key == deletedRoom && value == socket.id){
                canChange = true;
            }
        }
        if (!canChange){
            let socketTo=io.sockets.sockets.get(socket.id);
            socketTo.emit("delete_info", { message: "You are not the owner of this room so you cannot delete it" });
        }
        else{
            for (let i in userObjs){
                //if the user is in the room we want to delete
                if (userObjs[i].room == deletedRoom){
                    //kick all users that are in the room
                    let socketTo=io.sockets.sockets.get(userObjs[i].id);
                    

                    socketTo.emit("successKick", { userKicked: userObjs[i].name });

                }
            }
            for (let i in chatrooms){
                if(chatrooms[i]==deletedRoom){
                    //remove element at index i
                    chatrooms.splice(i,1);
                }
            }
            io.sockets.emit("roomDeleted",{roomName:deletedRoom});
        }
    });
    
});

