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

var settingsStore = new QSettings(Amarok.Info.scriptPath()+"/"+"saved_preferences", QSettings.IniFormat);
settingsStore.beginGroup("vk_search");
var token = settingsStore.value("token", null);
var user_id = settingsStore.value("user_id", null);
var unique_songs = [];

function Dialog() {
    var UIloader = new QUiLoader(this);
    var uiFile = new QFile (Amarok.Info.scriptPath() + "/auth.ui");
    uiFile.open(QIODevice.ReadOnly);
    this.dialog = UIloader.load(uiFile,this);
    webView = this.dialog.centralwidget.webView;
    //var authUrl = new QUrl('http://oauth.vk.com/authorize?client_id=2969829&scope=friends,audio&redirect_uri=http://oauth.vk.com/blank.html&display=popup&response_type=token');
    //webView.url = authUrl;
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
                    onPopulate(1, null, "");
                }
            });
    this.show = this.dialog.show;
}

// initialize the service
function vk_search() {
    dialog = new Dialog();
    Amarok.Window.addSettingsMenu("VkAuth", "Авторизация vk.com", 'configure');
    Amarok.Window.SettingsMenu.VkAuth["triggered()"].connect(Amarok.Window.SettingsMenu.VkAuth, dialog.show);
    if (token && user_id) {
        var path = "https://api.vk.com/method/users.isAppUser?uid="+user_id+"&access_token="+token;
        var qurl = new QUrl(path);
        var d = new Downloader(qurl, function(reply){
            reply = JSON.parse(reply);
            if (reply['response'] == 0) {
                script.donePopulating();
                dialog.show();
            }
        });
    }
    if (!user_id || !token) {
        dialog.show();
    }
       // setup service
    ScriptableServiceScript.call( this, "vk_search", 2, "Search & listen music from VK.com", "Vkontakte.ru", true);
}

// set service appearance
function onCustomize() {
    var currentDir = Amarok.Info.scriptPath() + "/";
    script.setIcon(new QPixmap(currentDir + "VK_logo.png" ));
    script.setEmblem(new QPixmap(currentDir + "VK_emblem.png"));
    picture_url = currentDir + "VK_logo.png";
}

function VkFetchResult(reply) {
    reply = JSON.parse(reply)
    if (reply['error']) {
        dialog.show();
    } else {
        uids = JSON.stringify(reply['response']); //Вместо того, чтобы обрабатывать в цикле, просто сделаем строку и грохнем [] вокруг нее ;)
        uids = uids.replace('[', '')
        uids = uids.replace(']', '')
        uids=uids+","+user_id;
        var path = "https://api.vk.com/method/users.get?fields=screen_name,photo_medium_rec&uids="+uids+"&access_token="+token;
        var qurl = new QUrl(path);
        var d = new Downloader(qurl, SetFriendsList);
    }
}

function SetFriendsList(reply) {
        reply = JSON.parse(reply);
        if (reply['error']) {
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
        dialog.show();
    } else {
        audiolist = reply['response']; //each entrie represents a music clip
        for (var i = 0; i < audiolist.length; i++) {
            var artist = audiolist[i]['artist'];
            var title = audiolist[i]['title'];
            var url =  audiolist[i]['url'];
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
        dialog.show();
    } else {
        audiolist = reply['response']; //each entrie represents a music clip
        var checkArray={};
        for (var i = 1; i < audiolist.length; i++) {
            var artist = audiolist[i]['artist'];
            var title = audiolist[i]['title'];
            var fullTitle = title + " " + artist;
            var fullTitleLow = fullTitle.toLowerCase();

            var url =  audiolist[i]['url'];
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
    filter = filter.replace(/\&/g, '%26');
    filter = filter.trim();
    currentFilter = filter.toLowerCase();
    if (currentFilter == "") {
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
        Amarok.debug(currentFilter);
        Amarok.debug(level);
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


var script = new vk_search();
script.populate.connect(onPopulate);
script.customize.connect(onCustomize);
