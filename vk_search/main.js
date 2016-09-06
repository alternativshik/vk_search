/*#########################################################################
#   Amarok script for listen music from Vkontakte.ru (Vk.com)             #
#                                                                         #
#   Copyright                                                             #
#   (C) 2009 Sergey Maltsev <alternativshik@gmail.com>                    #
#                                                                         #
#                                                                         #
#   This program is free software; you can redistribute it and/or modify  #
#   it under the terms of the GNU General Public License as published by  #
#   the Free Software Foundation; either version 2 of the License, or     #
#   (at your option) any later version.                                   #
#                                                                         #
#   This program is distributed in the hope that it will be useful,       #
#   but WITHOUT ANY WARRANTY; without even the implied warranty of        #
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the         #
#   GNU General Public License for more details.                          #
#                                                                         #
#   You should have received a copy of the GNU General Public License     #
#   along with this program; if not, write to the                         #
#   Free Software Foundation, Inc.,                                       #
#   51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.         #
#########################################################################*/

Importer.loadQtBinding("qt.core");
Importer.loadQtBinding("qt.gui");
Importer.loadQtBinding("qt.network");
Importer.loadQtBinding("qt.uitools");

//native settings store seems broken
var settingsStore = new QSettings(Amarok.Info.scriptPath()+"/"+"saved_preferences", QSettings.IniFormat);
settingsStore.beginGroup("vk_search");
var token = settingsStore.value("token", null);
var user_id = settingsStore.value("user_id", null);
var last_status = settingsStore.value("last_status");
var init_success = true;


function AuthDialog() {
    var UIloader = new QUiLoader(this);
    var uiFile; var availWidgets = UIloader.availableWidgets();
    if (availWidgets.indexOf("QWebView") == -1 && availWidgets.indexOf("KWebView") != -1) {
        uiFile = new QFile (Amarok.Info.scriptPath() + "/auth_kwebview.ui"); //switch to KWebView
    } else {
        uiFile = new QFile (Amarok.Info.scriptPath() + "/auth.ui");
    }
    uiFile.open(QIODevice.ReadOnly);
    this.dialog = UIloader.load(uiFile,this);
    webView = this.dialog.centralwidget.webView;
    webView.urlChanged.connect(this, function(){
        url = webView.url.toString();
        url = url.split('#');
        if (url.length > 1) {
            this.dialog.hide();
            token_string = url[1].split('&');
            if (token_string.length == 3) {
                token = token_string[0].split('=')[1];
                expire = token_string[1].split('=')[1];
                user_id = token_string[2].split('=')[1];
                ts = Math.round((new Date()).getTime() / 1000);
            }
            settingsStore.setValue('token', token);
            settingsStore.setValue('expire', expire);
            settingsStore.setValue('user_id', user_id);
            settingsStore.setValue('get', ts);
            settingsStore.sync();
            getStatus();
            init_success = true;
            onPopulate(1, null, "");
        }
    });
    this.show = this.dialog.show;
}

function CapchaDialog(url) {

}


// initialize the service
function init() {
    dialog = new AuthDialog();

    Amarok.Window.addSettingsMenu("VkAuth", "Авторизация vk.com", 'configure');
    Amarok.Window.SettingsMenu.VkAuth["triggered()"].connect(Amarok.Window.SettingsMenu.VkAuth, dialog.show);
    if (token && user_id) {
        var path = "https://api.vk.com/method/users.isAppUser?uid="+user_id+"&access_token="+token;
        var qurl = new QUrl(path);
        var d = new Downloader(qurl, function(reply){
            reply = JSON.parse(reply);
            if (reply['response'] === 0) {
                init_success = false;
                dialog = new AuthDialog();
                dialog.show();
            } else {
                getStatus();
            }
        });
    }
    if (!user_id || !token) {
        init_success = false;
        dialog = new AuthDialog();
        dialog.show();
    }
    Amarok.Engine.trackChanged.connect(
        function() {
            if (Amarok.Engine.engineState() === 0) {
                setAudioStatus();
            } else {
                setTextStatus();
            }
        }
    );

    Amarok.Engine.trackPlayPause.connect(
        function(state){
            if (state == 1) { // paused
                setTextStatus();
            } else {
                setAudioStatus(); // resumed
            }
        }
    );

    Amarok.Engine.trackFinished.connect(
        function() {
            setTextStatus();
        }
    );
}

function vk_search() {
    // setup service
    ScriptableServiceScript.call(this, "vk_search", 2, "Search & listen music from VK.com", "Vkontakte.ru", true);
}

function getStatus() {
    var path = "https://api.vk.com/method/status.get?uid="+user_id+"&access_token="+token;
    var qurl = new QUrl(path);
    var d = new Downloader(qurl, function(reply){
        reply = JSON.parse(reply);
        if (!reply['response']['audio']) {
            if (reply['response']['text']) {
                last_status = reply['response']['text'];
            } else {
                last_status = "";
            }
            settingsStore.setValue('last_status', last_status);
            settingsStore.sync();
        }
    });
}

function setTextStatus() {
    getStatus();
    var path = "https://api.vk.com/method/status.set?uid="+user_id+"&text="+last_status+"&access_token="+token;
    var qurl = new QUrl(path);
    var d = new Downloader(qurl, function(reply){
        reply = JSON.parse(reply);
        if (reply['response'] != '1') {
            Amarok.Window.Statusbar.shortMessage( "VK.com: Enable music translation in your vk.com account!" );
        }
    });
}

function setAudioStatus() {
    getStatus();
    var audio = Amarok.Engine.currentTrack().url;
    audio = audio.split('#');
    if (audio.length > 1) {
        var path = "https://api.vk.com/method/status.set?uid="+user_id+"&audio="+audio[1]+"&access_token="+token;
        var qurl = new QUrl(path);
        var d = new Downloader(qurl, function(reply){
            reply = JSON.parse(reply);
            if (reply['response'] != '1') {
                Amarok.Window.Statusbar.shortMessage( "VK.com: Enable music translation in your vk.com account!" );
            }
        });
    }
}

// set service appearance
function onCustomize() {
    var currentDir = Amarok.Info.scriptPath() + "/";
    script.setIcon(new QPixmap(currentDir + "VK_logo.png" ));
    script.setEmblem(new QPixmap(currentDir + "VK_emblem.png"));
    picture_url = currentDir + "VK_logo.png";
}

function VkFetchResult(reply) {
    reply = JSON.parse(reply);
    if (reply['error']) {
        dialog = new AuthDialog();
        dialog.show();
    } else {
        uids = JSON.stringify(reply['response']); //Вместо того, чтобы обрабатывать в цикле, просто сделаем строку и грохнем [] вокруг нее ;)
        uids = uids.replace('[', '');
        uids = uids.replace(']', '');
        uids=uids+","+user_id;
        var path = "https://api.vk.com/method/users.get?fields=screen_name,photo_medium_rec&uids="+uids+"&access_token="+token;
        var qurl = new QUrl(path);
        var d = new Downloader(qurl, SetFriendsList);
    }
}

function SetFriendsList(reply) {
        reply = JSON.parse(reply);
        if (reply['error']) {
            dialog = new AuthDialog();
            dialog.show();
        } else {
            users = reply['response'];
            for (var i = 0; i < users.length; i++)
            {
                var uid = users[i]['uid'];

                var first_name = users[i]['first_name'];
                var last_name = users[i]['last_name'];
                var screen_name = users[i]['screen_name'];
                var photo = users[i]['photo_medium_rec'];

                var path = "https://api.vk.com/method/audio.get?uid="+uid+"&access_token="+token;
                var callback = new QUrl(path);
                var item = Amarok.StreamItem;
                item.level = 1;
                item.callbackData = callback;
                item.itemName = first_name+" "+last_name+" ("+screen_name+")";
                item.playableUrl = "";
                item.coverUrl = photo;
                script.insertItem(item);
            }

        script.donePopulating();
    }
}

function getAudio(reply) {
    reply = JSON.parse(reply);
    if (reply['error']) {
        // Error codes from http://vk.com/developers.php?oid=-1&p=audio.edit
        if (reply['error']["error_code"] == 5) { //User authorization failed.
        Amarok.debug('######################## 5 #######################');

                dialog = new AuthDialog();

            dialog.show();
        }
        if (reply['error']["error_code"] == 201) {
            Amarok.Window.Statusbar.shortMessage(reply['error']['error_msg']); // Access denied.
        }
    } else {
        audiolist = reply['response']; //each entrie represents a music clip
        for (var i = 0; i < audiolist.length; i++) {
            var artist = decode_html(audiolist[i]['artist']);
            var title = decode_html(audiolist[i]['title']);
            var url =  audiolist[i]['url']+"#"+audiolist[i]['owner_id']+"_"+audiolist[i]['aid'];
            var url = new QUrl(url);
            //create music clip item
            var item = Amarok.StreamItem;
            item.level = 0;
            item.callbackData = "";
            item.itemName =artist+" - "+title;
            item.playableUrl = new QUrl(url);
            item.artist = artist;
            item.coverUrl = "";
            script.insertItem(item);
        }
        script.donePopulating();
    }
}


function search(reply) {
    Amarok.debug(reply);
    reply = JSON.parse(reply);
    if (reply['error']) {
        dialog = new AuthDialog();
        dialog.show();
    } else {
        audiolist = reply['response']; //each entrie represents a music clip
        var checkArray={};
        unique_songs = [];
        for (var i = 1; i < audiolist.length; i++) {
            var artist = decode_html(audiolist[i]['artist']);
            var title = decode_html(audiolist[i]['title']);
            var fullTitle = title + " " + artist;
            var fullTitleLow = fullTitle.toLowerCase();

            var url =  audiolist[i]['url']+"#"+audiolist[i]['owner_id']+"_"+audiolist[i]['aid'];
            var url = new QUrl(url);
            var duration =audiolist[i]['duration'];
            Amarok.debug(artist);
            if (checkArray[fullTitleLow] && checkArray[fullTitleLow].length) {
                if (checkArray[fullTitleLow].indexOf(duration) > -1) continue;
                   else checkArray[fullTitleLow].push(duration);
            } else checkArray[fullTitleLow] = [duration];
            unique_songs.push({"artist": artist, "title" : title, "url" : url});
        }
        var artists = [];
        for (var i = 0; i < unique_songs.length; i++) {
            var artist = unique_songs[i].artist;
            if (artists[artist]) {
                continue;
            } else {
                artists[artist] = artist;
                var item = Amarok.StreamItem;
                item.level = 1;
                item.callbackData = artists[artist];
                item.itemName = artists[artist];
                item.playableUrl = "";
                item.artist = artist;
                item.coverUrl = picture_url;
                item.infoHtml = artist;
                script.insertItem(item);
            }
        }
        script.donePopulating();
    }
}

function onPopulate(level, callback, filter) {
    if (init_success) {
        filter = filter.replace(/\&/g, '%26');
        filter = filter.trim();
        currentFilter = filter.toLowerCase();
        if (currentFilter === "") {
            if (level == 1) {
                try {
                    var path = "https://api.vk.com/method/friends.get?order=hints&uid="+user_id+"&access_token="+token;
                    var qurl = new QUrl(path);
                    Amarok.Window.Statusbar.longMessage( "VK.com: loading data. This need some time, depending on the speed of your internet connection..." );
                    var d = new Downloader(qurl, VkFetchResult);
                }
                catch(err) {
                    Amarok.debug( err );
                }
            } else if (level == 0) {
                Amarok.Window.Statusbar.longMessage( "VK.com: loading data. This need some time, depending on the speed of your internet connection..." );
                Amarok.debug( " Populating audio level..." );
                Amarok.debug( " url: " +  callback );
                var path = callback;
                var qurl = new QUrl(path);
                var d = new Downloader(qurl, getAudio);
            }
        } else {
            if (level > 0) {
                try {
                    var path = "https://api.vk.com/method/audio.search?auto_complete=1&count=200&&q="+currentFilter+"&access_token="+token;
                    var qurl = new QUrl(path);
                    Amarok.debug(path);
                    var b = new Downloader(qurl, search);
                } catch(err) {
                    Amarok.debug( err );
                }
            } else {
                if (typeof unique_songs !== 'undefined') {
                    for (var i = 0; i < unique_songs.length; i++) {
                        var elt = unique_songs[i];
                        var artist = elt.artist;
                        Amarok.debug(artist);
                        if(artist == callback) {
                            var title = elt.title;
                            var url = elt.url;
                            var item = Amarok.StreamItem;
                            item.level = 0;
                            item.callbackData = "";
                            item.itemName = title;
                            item.playableUrl = new QUrl(url);
                            item.artist = artist;
                            item.coverUrl = "";
                            script.insertItem(item);
                        } else {
                            continue;
                        }
                    }
                script.donePopulating();
                }
            }
        }
    }
}


Object.prototype.indexOf = function(e) {
  var i=0;
  for (i=0;i<this.length;i++)
    if (this[i]==e) return i;
  return -1;
}

String.prototype.trim = function() {
  a = this.replace(/^(%20)+/, '');
  return a.replace(/(%20)+$/, '');
}

function decode_html(str)
{
       str = str.replace(/&quot;/g, "\"");
       str = str.replace(/&lt;/g, "\<");
       str = str.replace(/&gt;/g, "\>");
       str = str.replace(/&#39;/g, "\'");
       str = str.replace(/&amp;/g, "\&");
       return str;
}

init();

var script = new vk_search();
script.populate.connect(onPopulate);
script.customize.connect(onCustomize);
