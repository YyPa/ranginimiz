const { Client, Util } = require('discord.js');
const { TOKEN, PREFIX, GOOGLE_API_KEY } = require('./ayarlar.json');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');

const client = new Client({ disableEveryone: true });

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map();

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('Rangin hizmet vermeye basladi!'));

client.on('disconnect', () => console.log('Rangin internetden kaynakli bir sorun Yuzunden Cikti.'));

client.on('reconnecting', () => console.log('Rangin tekrardan baglandi.'));

client.on('message', async msg => { // eslint-disable-line
	if (msg.author.bot) return undefined;
	if (!msg.content.startsWith(PREFIX)) return undefined;

	const args = msg.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(msg.guild.id);

	let command = msg.content.toLowerCase().split(' ')[0];
	command = command.slice(PREFIX.length)

	if (command === 'çal') {
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
	} else if (command === 'geç') {
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
			return msg.channel.send('Sarkı Durdu');
		}
		return msg.channel.send('Sarkı Durdu.');
	} else if (command === 'resume') {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.dispatcher.resume();
			return msg.channel.send('Tekrar Başladı!');
		}
		return msg.channel.send(':x: Müzik Calmıyor');
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
			if (reason === 'İnternetden Kaynaklı Sorun Cıktı.') console.log('Sarkilar Bitti..');
			else console.log(reason);
			serverQueue.songs.shift();
			play(guild, serverQueue.songs[0]);
		})
		.on('error', error => console.error(error));
	dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

	serverQueue.textChannel.send(`:notes: **${song.title}** Adli Sarki Basladi`);
}

	//Komutlar klasötündeki .js uzantılı dosyaları komut olarak algılayabilmesi için:
	const Discord = require("discord.js");
	client.commands = new Discord.Collection();
	const fs = require("fs");
	const ayarlar = require('./ayarlar.json');

	client.on('ready', () => {
	console.log("Oynuyor ayarlaniyor...");
	setTimeout(function(){
	console.log("Bot artik oyun oynuyor");
	}, 1000);
	function botStatus() {
        let status = [
            `Prefix : ${ayarlar.prefix}.`,
            `Teşekkürler: ${client.guilds.size} sunucu.`,
            `Teşekkürler: ${client.guilds.reduce((a, b) => a + b.memberCount, 0).toLocaleString()} kullanıcı.`,
            `Rangini kullandığınız için teşekkürler`,
            `Geliştiriciler: Enes Onur Ata#9427 - [R4]❊Yusuf  ☬ ˢᶜᵃʳʸ#2022 - Ƥƛ | OxyGeN#7035`,
        ];
        let rstatus = Math.floor(Math.random() * status.length);

        client.user.setActivity(status[rstatus], {Type: 'STREAMING'});        // BOT STATUS
      }; setInterval(botStatus, 20000)
        setInterval(() => {
        dbl.postStats(client.guilds.size)
        }, 1800000);
	})

	fs.readdir("./komutlar/", (err, files) => {
    	console.log(`Basariyla ${files.length} tane komut yuklendi.`)
	if(err) console.log(err);
	let jsfile = files.filter(f => f.split(".").pop() === "js");
	if(jsfile.length <= 0){
	console.log("Bu isimde bir komut bulunamadi.");
	return;
	}


	jsfile.forEach((f, i) =>{
	let props = require(`./komutlar/${f}`);
	console.log(`Yuklendi : ${f}`);
	client.commands.set(props.help.name, props);
        });
        });


	//YARDIM
	const prefix = "ayarlar.prefix";
	client.on('message', msg => {
    	if (msg.content === prefix + 'yardım') {
	const embed = new Discord.RichEmbed()
  	.setTitle("Bot Komutları")
  	.setAuthor("Rangin ∞ | Komutlar (r!) İle Başlar", "")
  	.setColor("RANDOM")
  	.setDescription('davet • Botun davet linkini atar.\nYeni Kodlar Gelicek\nbug • Bottaki bugu bildirmenizi sağlar.\nping • Botun pingini gösterir.\nsunucubilgi • Bu komutu hangi sunucuda kullanıysanız oranın bilgisini verir.\ntavsiye • Botun sahibine verdiğiniz tavsiyeyi gönderir.\n')
  	.addField("Moderasyon Komutları", "ban • Belirttiğiniz kişiyi sunucudan banlar.\nkick • Belirttiğiniz kişiyi sunucudan atar.\nsustur • Belirttiğin kişiyi susturur.\ntemizle • Sohbeti belirttiğin sayı kadar siler.\nunban • Belirttiğin kişinin sunucudaki yasağını kaldırır.\noylama • Oylama Açarsınız.\nhastebin • Hastebine Kod Ekler.\n")
  	.addField("Müzik Kodları", "çal• Müzik Çalar.\ngeç • Müzik Atlar\ndur • Müziği Durdurur\nkuyruk • müzik listesi\n", true)
  	.addField(" Kullanıcı Komutları", "• Yeni Kodlar Gelicek\nkurucu • Sunucunun kurucusunu gösterir.\nkullanıcıbilgim • Bu komutu kullanan her kimse hakkında bilgi verir.\n", true)
  	message.channel.send({embed});
	};
	});	


//TOKEN
client.login(TOKEN);
