/*#########################################################################
#   Amarok scripted service for vk.com (VKontakte) audio library.         #
#                                                                         #
#   Copyright                                                             #
#   (C) 2009 Sergey Maltsev <alternativshik@gmail.com>                    #
#   (C) 2013 Ivan Shapovalov <intelfx100@gmail.com>                       #
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

Importer.loadQtBinding ("qt.core");
Importer.loadQtBinding ("qt.gui");
Importer.loadQtBinding ("qt.network");
Importer.loadQtBinding ("qt.uitools");

//native settings store seems broken
var settingsStore = new QSettings (Amarok.Info.scriptPath() + "/saved_preferences", QSettings.IniFormat);
settingsStore.beginGroup ("vk_search");

var token = settingsStore.value ("token", null);
var user_id = settingsStore.value ("user_id", null);
var last_status = settingsStore.value ("last_status");


// ########################################################################
// Service initialization routines.
// ########################################################################

// Creates an authentication dialog.
function Dialog() {
	var UIloader = new QUiLoader (this);
	var uiFile = new QFile (Amarok.Info.scriptPath() + "/auth.ui");
	uiFile.open (QIODevice.ReadOnly);

	this.dialog = UIloader.load (uiFile, this);

	webView = this.dialog.centralwidget.webView;
	webView.urlChanged.connect (this, function() {
		url = webView.url.toString();
		url = url.split ('#');
		if (url.length > 1) {
			this.dialog.hide();
			token_string = url[1].split ('&');
			if (token_string.length == 3) {
				token = token_string[0].split ('=')[1];
				expire = token_string[1].split ('=')[1];
				user_id = token_string[2].split ('=')[1];
				ts = Math.round (new Date().getTime() / 1000);
			}

			settingsStore.setValue ('token', token);
			settingsStore.setValue ('expire', expire);
			settingsStore.setValue ('user_id', user_id);
			settingsStore.setValue ('get', ts);
			settingsStore.sync();
			onPopulate (1, null, "");
		}
	});

	this.show = this.dialog.show;
}

// Sets up service's appearance.
function onCustomize() {
	var currentDir = Amarok.Info.scriptPath() + "/";
	script.setIcon (new QPixmap (currentDir + "VK_logo.png"));
	script.setEmblem (new QPixmap (currentDir + "VK_emblem.png"));
	picture_url = currentDir + "VK_logo.png";
}

// Initializes the service.
function vk_search() {
	dialog = new Dialog();
	Amarok.Window.addSettingsMenu ("VkAuth", "Авторизоваться на vk.com…", 'configure');
	Amarok.Window.SettingsMenu.VkAuth["triggered()"].connect (Amarok.Window.SettingsMenu.VkAuth, dialog.show);
	if (token && user_id) {
		var path = "https://api.vk.com/method/users.isAppUser?uid=" + user_id + "&access_token=" + token;
		var d = new Downloader (new QUrl (path), function (reply) {
			reply = JSON.parse (reply);
			if (reply['response'] == '0') {
				dialog.show();
			} else {
				saveStatus();
			}
		});
	}

	if (!user_id || !token) {
		dialog.show();
	}

	Amarok.Engine.trackChanged.connect(
		function() {
			if (Amarok.Engine.engineState() == 0) {
				setAudioStatus();
			} else {
				setTextStatus();
			}
		}
	);

	Amarok.Engine.trackPlayPause.connect(
		function (state) {
			if (state == 1) {
				setTextStatus();
			} else {
				setAudioStatus();
			}
		}
	);
	
	Amarok.Engine.trackFinished.connect(
		function() {
			setTextStatus();
		}
	);

	ScriptableServiceScript.call (this, "vk_search", 4, "Search and listen music from vk.com (VKontakte)", "vk.com", true);
}


// ########################################################################
// Low-level helper functions.
// ########################################################################

// Parses a vk.com audio file URL, extracting user and track identifiers.
function parseAudioUrl (url) {
	var matchRegex = new RegExp ("^.*/u([0-9]*)/audios/a([0-9a-f]*)\\..*$");
	return matchRegex.exec (url);
}

// Finds an object in an array.
function indexOf (obj, e) {
	for (var i = 0; i < obj.length; i++) {
		if (obj[i] == e) return i;
	}
	return -1;
}

// Removes leading/trailing spaces on a string.
String.prototype.trim = function() {
	a = this.replace (/^(%20)+/, '');
	return a.replace (/(%20)+$/, '');
}

// Decodes HTML escape sequences.
function decode_html (str) {
	str = str.replace (/&quot;/g, "\"");
	str = str.replace (/&lt;/g, "\<");
	str = str.replace (/&gt;/g, "\>");
	str = str.replace (/&#39;/g, "\'");
	str = str.replace (/&amp;/g, "\&");
	return str;
}


// ########################################################################
// Operation helper functions.
// ########################################################################

// Queries vk.com for user's status string and saves it to the settings file.
function saveStatus() {
	var path = "https://api.vk.com/method/status.get?uid=" + user_id + "&access_token=" + token;

	var d = new Downloader (new QUrl (path), function (reply) {
		reply = JSON.parse (reply);

		if (!reply['response']['audio']) {
			if (reply['response']['text']) {
				last_status = reply['response']['text'];
			} else {
				last_status = "";
			}

			settingsStore.setValue ('last_status', last_status);
			settingsStore.sync();
		}
	});
}

// Sets vk.com user's status as a plain text string.
function setTextStatus() {
	saveStatus();

	var path = "https://api.vk.com/method/status.set?uid=" + user_id + "&text=" + last_status + "&access_token=" + token;

	var d = new Downloader (new QUrl (path), function (reply) {
		reply = JSON.parse (reply);
		if (reply['response'] != '1') {
			Amarok.Window.Statusbar.shortMessage ("vk.com: Status update disabled by user.");
		}
	});
}

// Sets vk.com user's status as an "active" string for the currently playing track, if applicable.
function setAudioStatus() {
	saveStatus();

	var parsed = parseAudioUrl (Amarok.Engine.currentTrack().url);
	if (parsed && parsed.length == 3) {
		var path = "https://api.vk.com/method/status.set?uid=" + user_id + "&audio=" + parsed[1] + "_" + parsed[2] + "&access_token=" + token;

		var d = new Downloader (new QUrl (path), function (reply) {
			Amarok.debug ("vk: setAudioStatus(): reply = " + reply);
			reply = JSON.parse (reply);

			if (reply['response'] != '1') {
				Amarok.Window.Statusbar.shortMessage ("vk.com: Status update disabled by user.");
			}
		});
	}
}


// ########################################################################
// Amarok list item inserters.
// ########################################################################

// Adds an "user" list entry (fourth level - "genre").
function addUser (user) {
	var uid = user['uid'];
	var first_name = user['first_name'];
	var last_name = user['last_name'];
	var screen_name = user['screen_name'];
	var nickname = user['nickname'];
	// var photo = user['photo_medium_rec'];
	
	if (!screen_name) {
		return; // inexistent user (deleted themselves).
	}
	
	if (nickname != "") {
		nickname = "«" + nickname + "» ";
	}

	var path = "https://api.vk.com/method/audio.get?uid=" + uid + "&access_token=" + token;

	var item = Amarok.StreamItem;
	item.level = 3;
	item.itemName = first_name + " " + nickname + last_name + " (" + screen_name + ")";
	item.playableUrl = "";
	item.coverUrl = ""; // photo;
	item.callbackData = path;

	script.insertItem (item);
}

// Adds an "artist" list entry (third level - "artist").
function addArtist (artist, data) {
	Amarok.debug ("Adding artist: artist = '" + artist + "', data = '" + data + "'");

	var item = Amarok.StreamItem;
	item.level = 2;
	item.itemName = artist;
	item.playableUrl = "";
	item.coverUrl = "";
	item.callbackData = data;

	script.insertItem (item);
}

// Adds a final "track" list entry (first level - "track").
function addTrack (artist, track) {
	var title = decode_html (track['title']);
	var url = track['url'];

	var item = Amarok.StreamItem;
	item.level = 0;
	item.itemName = title;
	item.playableUrl = url;
	item.coverUrl = "";
	item.callbackData = "";

	script.insertItem (item);
}

// Adds a dummy list entry with given level, name and callback data.
function addFakeItem (level, name, data) {
	var item = Amarok.StreamItem;
	item.level = level;
	item.itemName = name;
	item.playableUrl = "";
	item.coverUrl = "";
	item.callbackData = data;

	script.insertItem (item);
}


// ########################################################################
// Internal JSON parsers.
// ########################################################################

// Generates a per-artist track list.
function populateTracksPerAlbum (jsonData) {
	Amarok.debug ("Writing per-artist TRACKS: data = '" + jsonData + "'")
	var jsonParsed = JSON.parse (jsonData);

	var artist = jsonParsed['artist'];
	var trackList = jsonParsed['tracks'];

	for (var i = 0; i < trackList.length; i++) {
		addTrack (artist, trackList[i]);
	}

	script.donePopulating();
}

// Generates a per-artist album list.
function populateAlbumPerArtist (jsonData) {
	Amarok.debug ("Writing per-artist FAKE ALBUM: data = '" + jsonData + "'")
	var jsonParsed = JSON.parse (jsonData);

	var artist = jsonParsed['artist'];

	addFakeItem (1, artist, jsonData);

	script.donePopulating();
}


// ########################################################################
// vk.com API reply JSON parsers.
// ########################################################################

// Handles a server error.
function handleReplyError (reply) {
	Amarok.Window.Statusbar.shortMessage (reply['error']['error_msg']);

	if (reply['error']["error_code"] == 5) { // "User authorization failed" error code, according to vk.com API documentation.
		dialog.show();
	}
}

// Parses "friends.get" vk.com API request (and maybe others).
function readUIDs (reply) {
	reply = JSON.parse (reply)

	if (reply['error']) {
		handleReplyError (reply);
	} else {
		uids = JSON.stringify (reply['response']).replace (/[][]/g, '') + "," + user_id; //Вместо того, чтобы обрабатывать в цикле, просто сделаем строку и грохнем [] вокруг нее ;)

		var path = "https://api.vk.com/method/users.get?fields=nickname,screen_name,photo_medium_rec&uids=" + uids + "&access_token=" + token;
		var d = new Downloader (new QUrl (path), readUserList);
	}
}

// Parses "users.get" vk.com API request.
function readUserList (reply) {
	reply = JSON.parse (reply);

	if (reply['error']) {
		handleReplyError (reply);
	} else {
		users = reply['response'];

		for (var i = 0; i < users.length; i++) {
			addUser (users[i]);
		}
	}

	script.donePopulating();
}

// Parses "audio.get" vk.com API request.
function readTrackList (reply) {
	reply = JSON.parse (reply);

	if (reply['error']) {
		handleReplyError (reply);
	} else {
		trackList = reply['response'];

		var artists = [];
		for (var i = 0; i < trackList.length; i++) {
			var artist = decode_html (trackList[i]['artist']);
			Amarok.debug ("Adding track: artist = '" + artist + "', title = '" + trackList[i]['title'] + "'");

			if (!artists[artist]) {
				artists[artist] = "{ \"artist\": \"" + trackList[i]['artist'] + "\", \"tracks\": [";
			}

			artists[artist] += " { \"title\": \"" + trackList[i]['title'] + "\", \"url\": \"" + trackList[i]['url'] + "\" },"
		}

		for (var artist in artists) {
			addArtist (artist, artists[artist].slice (0, -1) + " ] }");
		}
	}

	script.donePopulating();
}

// Parses "audio.search" vk.com API request.
function readSearchResult (reply) {
	Amarok.debug ("Reading search results.");
	reply = JSON.parse (reply);

	if (reply['error']) {
		handleReplyError (reply);
	} else {
		var trackList = reply['response'];

		var checkArray = {};
		var artists = [];

		for (var i = 0; i < trackList.length; i++) {
			var artist = decode_html (trackList[i]['artist']);
			var title = decode_html (trackList[i]['title']);
			var fullTitle = title + " " + artist;
			var fullTitleLow = fullTitle.toLowerCase();
			var duration = trackList[i]['duration'];

			if (checkArray[fullTitleLow] && checkArray[fullTitleLow].length) {
				if (indexOf (checkArray[fullTitleLow], duration) > -1) continue;
				else checkArray[fullTitleLow].push (duration);
			} else checkArray[fullTitleLow] = [duration];

			if (!artists[artist]) {
				artists[artist] = "{ \"artist\": \"" + trackList[i]['artist'] + "\", \"tracks\": [";
			}

			artists[artist] += " { \"title\": \"" + trackList[i]['title'] + "\", \"url\": \"" + trackList[i]['url'] + "\" },"
		}

		for (var artist in artists) {
			addArtist (artist, artists[artist].slice (0, -1) + " ] }");
		}
	}

	script.donePopulating();
}


// ########################################################################
// Main Amarok list populate dispatcher callback.
// ########################################################################

function onPopulate (level, callback, filter) {
	if (level == 1) {
		populateAlbumPerArtist (callback);
	} else if (level == 0) {
		populateTracksPerAlbum (callback);
	} else {
		filter = filter.replace (/\&/g, '%26').trim().toLowerCase();

		if (filter == "") {
			if (level == 3) {
				Amarok.Window.Statusbar.longMessage ("vk.com: Loading user list. This will probably take some time.");

				var path = "https://api.vk.com/method/friends.get?order=hints&uid=" + user_id + "&access_token=" + token;
				var d = new Downloader (new QUrl (path), readUIDs);
			} else if (level == 2) {
				Amarok.Window.Statusbar.longMessage ("vk.com: Loading track list. This will probably take some time.");

				var path = callback;
				var d = new Downloader (new QUrl (path), readTrackList);
			}
		} else {
			if (level == 3) {
				Amarok.debug ("Inserting Search Results item.");
				addFakeItem (3, "Search Results", "");
				addFakeItem (3, "Search Results 2", "");

				script.donePopulating();
			} else if (level == 2) {
				Amarok.Window.Statusbar.longMessage ("vk.com: Loading search results. This will probably take some time.");

				var path = "https://api.vk.com/method/audio.search?auto_complete=1&count=200&&q=" + filter + "&access_token=" + token;
				var b = new Downloader (new QUrl (path), readSearchResult);
			}
		}
	}
}


// ########################################################################
// Top-level script code.
// ########################################################################

var script = new vk_search();
script.populate.connect (onPopulate);
script.customize.connect (onCustomize);
