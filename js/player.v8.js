(function () {
  /* =========================================================
   * 配置区 —— 请按需修改：
   *   metingBase : Meting API 基地址（需支持 CORS）
   *   server     : 音乐平台，netease / tencent / xiami / kugou 等
   *   playlistId : 歌单 ID
   * ========================================================= */
  var CFG = {
    metingBase: 'https://meting.jinghuashang.cn/api',
    server: 'netease',
    playlistId: '8564697446'
  };

  var audio = new Audio();
  var preloadAudio = new Audio(); // 后台预取下一首，减少切歌等待
  var tracks = [];
  var index = 0;
  var box, cover, titleEl, artistEl, playBtn, prevBtn, nextBtn,
      fillEl, curEl, durEl, listEl, lyricBtn, lyricEl, lrcEl;
  var lrcLines = [], lrcIndex = -1;

  function $(id) { return document.getElementById(id); }
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderList() {
    listEl.innerHTML = tracks.map(function (t, i) {
      return '<div class="nplayer-item' + (i === index ? ' active' : '') + '" data-i="' + i + '" role="button" tabindex="0">'
        + '<span class="ix">' + (i + 1) + '</span>'
        + '<span class="it">' + escapeHtml(t.name) + ' · ' + escapeHtml(t.artist) + '</span></div>';
    }).join('');
  }

  function parseLrc(text) {
    var out = [];
    var re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    var strip = /\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\]/g;
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var m, times = [];
      re.lastIndex = 0;
      while ((m = re.exec(line)) !== null) {
        times.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(m[3] || '0', 10) / 1000);
      }
      var content = line.replace(strip, '').trim();
      if (!times.length || !content) return;
      times.forEach(function (t) { out.push({ t: t, text: content }); });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  function renderLrc() {
    if (!lrcLines.length) {
      lrcEl.innerHTML = '<div class="lrc-null">暂无歌词</div>';
      return;
    }
    lrcEl.innerHTML = lrcLines.map(function (l, i) {
      return '<div class="lrc-line" data-i="' + i + '">' + escapeHtml(l.text) + '</div>';
    }).join('');
    lrcIndex = -1;
  }

  function scrollLrc(idx) {
    var line = lrcEl.children[idx];
    if (!line) return;
    var containerH = lyricEl.clientHeight;
    var lineTop = line.offsetTop;
    var lineH = line.clientHeight;
    var target = lineTop - containerH / 2 + lineH / 2;
    lyricEl.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }

  function updateLrc(t) {
    if (!lrcLines.length) return;
    var idx = -1;
    for (var i = 0; i < lrcLines.length; i++) {
      if (lrcLines[i].t <= t) idx = i; else break;
    }
    if (idx === lrcIndex) return;
    if (lrcIndex >= 0 && lrcEl.children[lrcIndex]) lrcEl.children[lrcIndex].classList.remove('active');
    lrcIndex = idx;
    if (idx >= 0 && lrcEl.children[idx]) {
      lrcEl.children[idx].classList.add('active');
      scrollLrc(idx);
    }
  }

  function loadLrc(url) {
    lrcLines = []; lrcIndex = -1;
    if (!lrcEl) return;
    lrcEl.innerHTML = '<div class="lrc-null">歌词加载中…</div>';
    if (!url) { lrcEl.innerHTML = '<div class="lrc-null">暂无歌词</div>'; return; }
    fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (text) {
        lrcLines = parseLrc(text);
        renderLrc();
      })
      .catch(function () {
        lrcEl.innerHTML = '<div class="lrc-null">暂无歌词</div>';
      });
  }

  function setNowPlaying() {
    var t = tracks[index];
    cover.src = t.pic || 'images/avatar.jpg';
    titleEl.textContent = t.name;
    artistEl.textContent = t.artist;
    curEl.textContent = '0:00';
    durEl.textContent = '0:00';
    fillEl.style.width = '0%';
    renderList();
    loadLrc(t.lrc || '');
  }

  function setPlaying(p) {
    box.classList.toggle('playing', p);
    playBtn.classList.toggle('playing', p);
  }

  function startTrack(i) {
    if (i < 0 || i >= tracks.length) return;
    index = i;
    setNowPlaying();
    var cur = i; // 记录本次请求的曲目，用于忽略切歌后迟到的失败回调
    var url = tracks[i].url;
    if (!url) {
      setPlaying(false);
      listEl.innerHTML = '<div class="nplayer-error">该曲目无法播放<br>（版权/地区限制或音频地址失效）</div>';
      return;
    }
    audio.src = url;
    audio.play().then(function () {
      if (cur === index) setPlaying(true);
    }, function () {
      if (cur !== index) return; // 已切到其他曲目，忽略这次迟到的失败
      setPlaying(false);
      listEl.innerHTML = '<div class="nplayer-error">该曲目无法播放<br>（版权/地区限制或音频地址失效）</div>';
    });
    prefetchNext(i);
  }

  function applyTracks(data) {        tracks = data.map(function (s) {
          return {
            name: s.name || s.title || '未知歌曲',
            artist: s.artist || s.author || '未知歌手',
            pic: s.pic || '',
            url: (s.url || '').replace(/^http:\/\//, 'https://'),
            lrc: (s.lrc || '').replace(/^http:\/\//, 'https://')
          };
        });
    index = 0;
    setNowPlaying();
    audio.preload = 'auto';
    if (tracks[0] && tracks[0].url) { // 提前加载第一首，点击播放即出声
      audio.src = tracks[0].url;
      audio.load();
    }
    prefetchNext(0);
  }

  function prefetchNext(i) {
    var n = tracks.length;
    if (!n) return;
    var next = tracks[(i + 1) % n];
    if (!next || !next.url) return;
    try {
      preloadAudio.preload = 'auto';
      preloadAudio.src = next.url;
      preloadAudio.load();
    } catch (e) {}
  }

  function load() {
    listEl.innerHTML = '<div class="nplayer-skeleton"><div class="sk-item"><div class="sk-avatar"></div><div class="sk-text"><div class="sk-line sk-w80"></div><div class="sk-line sk-w60"></div></div></div><div class="sk-item"><div class="sk-avatar"></div><div class="sk-text"><div class="sk-line sk-w70"></div><div class="sk-line sk-w50"></div></div></div><div class="sk-item"><div class="sk-avatar"></div><div class="sk-text"><div class="sk-line sk-w90"></div><div class="sk-line sk-w40"></div></div></div><div class="sk-item"><div class="sk-avatar"></div><div class="sk-text"><div class="sk-line sk-w75"></div><div class="sk-line sk-w55"></div></div></div><div class="sk-item"><div class="sk-avatar"></div><div class="sk-text"><div class="sk-line sk-w85"></div><div class="sk-line sk-w45"></div></div></div></div>';
    var cacheKey = 'npl_playlist_' + CFG.playlistId;
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch (e) {}
    if (cached && cached.time && Date.now() - cached.time < 3600000 && cached.data && cached.data.length) {
      applyTracks(cached.data);
      return;
    }
    fetch(CFG.metingBase + '?server=' + CFG.server + '&type=playlist&id=' + CFG.playlistId)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        if (!data || !data.length) throw new Error('empty');
        try { localStorage.setItem(cacheKey, JSON.stringify({ time: Date.now(), data: data })); } catch (e) {}
        applyTracks(data);
      })
      .catch(function () {
        if (cached && cached.data && cached.data.length) { applyTracks(cached.data); return; }
        listEl.innerHTML = '<div class="nplayer-error">歌单加载失败<br>请检查 Meting 地址或歌单 ID</div>';
      });
  }

  function init() {
    box = $('npl-box'); cover = $('npl-cover'); titleEl = $('npl-title'); artistEl = $('npl-artist');
    playBtn = $('npl-play'); prevBtn = $('npl-prev'); nextBtn = $('npl-next');
    fillEl = $('npl-fill'); curEl = $('npl-cur'); durEl = $('npl-dur'); listEl = $('npl-list');
    lyricBtn = $('npl-lyric-btn'); lyricEl = $('npl-lyric'); lrcEl = $('npl-lrc');
    if (!box || !listEl) return;

    playBtn.addEventListener('click', function () {
      if (!tracks.length) return;
      if (audio.paused) {
        audio.play().then(function () { setPlaying(true); });
      } else {
        audio.pause();
      }
    });
    prevBtn.addEventListener('click', function () {
      if (tracks.length) startTrack((index - 1 + tracks.length) % tracks.length);
    });
    nextBtn.addEventListener('click', function () {
      if (tracks.length) startTrack((index + 1) % tracks.length);
    });

    audio.addEventListener('timeupdate', function () {
      var d = audio.duration || 0;
      fillEl.style.width = (d ? (audio.currentTime / d) * 100 : 0) + '%';
      curEl.textContent = fmt(audio.currentTime);
      updateLrc(audio.currentTime);
    });
    audio.addEventListener('durationchange', function () {
      if (audio.duration) durEl.textContent = fmt(audio.duration);
    });
    audio.addEventListener('ended', function () {
      if (tracks.length) startTrack((index + 1) % tracks.length);
    });
    audio.addEventListener('play', function () { setPlaying(true); });
    audio.addEventListener('pause', function () { setPlaying(false); });

    listEl.addEventListener('click', function (e) {
      var it = e.target.closest ? e.target.closest('.nplayer-item') : null;
      if (it) startTrack(parseInt(it.getAttribute('data-i'), 10));
    });

    if (lyricBtn && lyricEl) {
      lyricBtn.addEventListener('click', function () {
        lyricEl.classList.toggle('show');
        lyricBtn.classList.toggle('active');
        if (lyricEl.classList.contains('show') && lrcIndex >= 0) scrollLrc(lrcIndex);
      });
    }
    if (lrcEl) {
      lrcEl.addEventListener('click', function (e) {
        var it = e.target.closest ? e.target.closest('.lrc-line') : null;
        if (!it) return;
        var i = parseInt(it.getAttribute('data-i'), 10);
        if (lrcLines[i] && audio.src) audio.currentTime = lrcLines[i].t;
      });
    }

    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
