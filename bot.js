const { Client, Util } = require('discord.js');
const { TOKEN, PREFIX, GOOGLE_API_KEY } = require('./ayarlar');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');

const client = new Client({ disableEveryone: true });

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map();

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('Bot Discord Baðlandý!'));

client.on('disconnect', () => console.log('Bot Ýnternetden Kaynaklý Bir Sorun Yüzünden Cýktý.'));

client.on('reconnecting', () => console.log('Bot Discord Tekrara Baðlandý.'));

client.on('message', async msg => { // eslint-disable-line
	if (msg.author.bot) return undefined;
	if (!msg.content.startsWith(PREFIX)) return undefined;

	const args = msg.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(msg.guild.id);

	let command = msg.content.toLowerCase().split(' ')[0];
	command = command.slice(PREFIX.length)

	if (command === 'oynat') {
		const voiceChannel = msg.member.voiceChannel;
		if (!voiceChannel) return msg.channel.send(':x: Lutfen Sesli Bir Kanal Giriniz.');
		const permissions = voiceChannel.permissionsFor(msg.client.user);
		if (!permissions.has('CONNECT')) {
			return msg.channel.send(':x: Odaya Girme Yetkim Yok');
		}
		if (!permissions.has('SPEAK')) {
			return msg.channel.send(':x: Kanalda Konusma Yetkim Yok');
		}

		if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
			const playlist = await youtube.getPlaylist(url);
			const videos = await playlist.getVideos();
			for (const video of Object.values(videos)) {
				const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line no-await-in-loop
				await handleVideo(video2, msg, voiceChannel, true); // eslint-disable-line no-await-in-loop
			}
			return msg.channel.send(`âœ… Oynatma Listesi: **${playlist.title}** Listeye Eklendi`);
		} else {
			try {
				var video = await youtube.getVideo(url);
			} catch (error) {
				try {
					var videos = await youtube.searchVideos(searchString, 10);
					let index = 0;
					msg.channel.send(`
__**Sarki Listesi:**__

${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}

Lutfen Hangi Sarkiyi Secmek isdededini Sec 1-10 Kadar Bir Sayi Yaz.
					`);
					// eslint-disable-next-line max-depth
					try {
						var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
							maxMatches: 1,
							time: 10000,
							errors: ['time']
						});
					} catch (err) {
						console.error(err);
						return msg.channel.send(':x: Gecersiz Deger Girildi.');
					}
					const videoIndex = parseInt(response.first().content);
					var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
				} catch (err) {
					console.error(err);
					return msg.channel.send(':x: Arana Sonucu Elde Edemedim');
				}
			}
			return handleVideo(video, msg, voiceChannel);
		}
	} else if (command === 'gec') {
		if (!msg.member.voiceChannel) return msg.channel.send(':x: Sesli Kanalda Degilsin.');
		if (!serverQueue) return msg.channel.send(':x: Sarki Calmiyor.');
		serverQueue.connection.dispatcher.end(':white_check_mark:  Basariyla Atladýn');
		return undefined;
	} else if (command === 'dur') {
		if (!msg.member.voiceChannel) return msg.channel.send(':x: Sesli Kanala Giriniz.');
		if (!serverQueue) return msg.channel.send(':x: Sarki Calmiyor.');
		serverQueue.songs = [];
		serverQueue.connection.dispatcher.end(':white_check_mark:  Basariyla Durdu.');
		return undefined;
	} else if (command === 'ses') {
		if (!msg.member.voiceChannel) return msg.channel.send(':x:  Sesli Kanala Giriniz');
		if (!serverQueue) return msg.channel.send(':x: Sarki Calmiyor.');
		if (!args[1]) return msg.channel.send(`Simdiki Ses Durumu: **${serverQueue.volume}**`);
		serverQueue.volume = args[1];
		serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
		return msg.channel.send(`Yeni Ses Durumu: **${args[1]}**`);
	} else if (command === 'np') {
		if (!serverQueue) return msg.channel.send(':x: Muzik Calmýyor');
		return msg.channel.send(`Oynatilan Sarki: **${serverQueue.songs[0].title}**`);
	} else if (command === 'kuyruk') {
		if (!serverQueue) return msg.channel.send(':x: Muzik Calmýyor');
		return msg.channel.send(`
__**Sarki Kuyrugu**__

${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}

**Oynatilan:** ${serverQueue.songs[0].title}
		`);
	} else if (command === 'dur') {
		if (serverQueue && serverQueue.playing) {
			serverQueue.playing = false;
			serverQueue.connection.dispatcher.pause();
			return msg.channel.send('Sarký Durdu');
		}
		return msg.channel.send('Sarký Durdu.');
	} else if (command === 'resume') {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.dispatcher.resume();
			return msg.channel.send('Tekrar Baþladý!');
		}
		return msg.channel.send(':x: Müzik Calmýyor');
	}

	return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
	const serverQueue = queue.get(msg.guild.id);
	console.log(video);
	const song = {
		id: video.id,
		title: Util.escapeMarkdown(video.title),
		url: `https://www.youtube.com/watch?v=${video.id}`
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queue.set(msg.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			var connection = await voiceChannel.join();
			queueConstruct.connection = connection;
			play(msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			console.error(`:x: Ses Kanalina Giremedim Hata: ${error}`);
			queue.delete(msg.guild.id);
			return msg.channel.send(`:x: Ses Kanalina Giremedim Hata: ${error}`);
		}
	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		if (playlist) return undefined;
		else return msg.channel.send(`Oynatma Listesine **${song.title}** Sarki Eklendi.`);
	}
	return undefined;
}

function play(guild, song) {
	const serverQueue = queue.get(guild.id);

	if (!song) {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
		return;
	}
	console.log(serverQueue.songs);

	const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
		.on('end', reason => {
			if (reason === 'Ýnternetden Kaynaklý Sorun Cýktý.') console.log('Sarkilar Bitti..');
			else console.log(reason);
			serverQueue.songs.shift();
			play(guild, serverQueue.songs[0]);
		})
		.on('error', error => console.error(error));
	dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

	serverQueue.textChannel.send(`:notes: **${song.title}** Adli Sarki Basladi`);
}

client.login(TOKEN);
