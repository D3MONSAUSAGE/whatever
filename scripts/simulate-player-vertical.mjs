// Vertical (9:16) boards in the TV player (PR C): zone boards are framed at their real canvas (contain, never
// stretched), landscape framing is unchanged, the viewport is reported in its own request, and the rotation hint
// shows only when it is certain and never blocks playback.
import { createPlayer, report } from "./player-harness.mjs";

const { check, done } = report();
const LAND_BOX = { x: 1286, y: 0, w: 634, h: 1080 };
const TALL_BOX = { x: 0, y: 1152, w: 1080, h: 768 };

function boardPlaylist(box, canvas) {
  return {
    id: "board", transition: "none", playbackMode: "auto",
    items: [{
      mediaId: "board", url: "https://cdn/board.jpg", durationMs: 60000, kind: "image",
      composition: { layoutVersion: 1, fallbackUrl: "https://cdn/board.jpg", ...(canvas || {}), video: { mediaId: "promo", url: "https://cdn/promo.mp4?dur=600000", box } },
    }],
  };
}
function start(opts, playlist, orientation) {
  const tv = createPlayer(opts);
  tv.S.playlist = playlist;
  tv.S.displayOrientation = orientation;
  tv.boot();
  tv.run(6000);
  return tv;
}
const zone = (tv) => ["va", "vb"].map((id) => tv.els[id]).find((v) => v.getAttribute("data-zone") === "1");
const place = (v) => v ? [v.style.left, v.style.top, v.style.width, v.style.height].join(" ") : "none";
const still = (tv) => ["a", "b"].map((id) => tv.els[id]).find((l) => l.className.indexOf("on") !== -1);

// 1. Landscape boards: the same pixels as before, with or without the additive canvas fields.
for (const [label, canvas] of [["no canvas fields", null], ["canvasWidth/canvasHeight 1920x1080", { canvasWidth: 1920, canvasHeight: 1080 }]]) {
  const tv = start({}, boardPlaylist(LAND_BOX, canvas));
  check(`landscape zone on 1280x720 (${label}) is placed exactly as before`, place(zone(tv)) === "857px 0px 423px 720px", place(zone(tv)));
  check(`landscape still on 1280x720 (${label}) is sized as before`, still(tv) && still(tv).style.backgroundSize === "1280px 720px" && still(tv).style.backgroundPosition === "0px 0px");
  check(`landscape (${label}): zone video plays, no errors`, zone(tv) && zone(tv).className.indexOf("on") !== -1 && tv.errors.length === 0, tv.errors.join("; "));
}
{
  const tv = start({}, boardPlaylist({ x: 0, y: 1152, w: 1080, h: 768 }));
  check("a landscape composition with a box outside 1920x1080 is still refused (no zone)", !zone(tv));
}

// 2. Vertical board on a horizontal TV: contained with empty space at the sides, never stretched.
{
  const tv = start({}, boardPlaylist(TALL_BOX, { canvasWidth: 1080, canvasHeight: 1920 }));
  check("vertical zone on 1280x720 is framed at 1080x1920 (contain)", place(zone(tv)) === "438px 432px 405px 288px", place(zone(tv)));
  check("vertical still on 1280x720 is 405x720 centered (no stretch)", still(tv) && still(tv).style.backgroundSize === "405px 720px" && still(tv).style.backgroundPosition === "438px 0px", still(tv) && still(tv).style.backgroundSize);
  // The same box in 9:16 units can't play in the horizontal frame (it isn't inside 1920x1080).
  check("vertical zone video plays", zone(tv) && zone(tv).className.indexOf("on") !== -1);
}
// 3. Vertical board on a vertical TV: full screen.
{
  const tv = start({ innerWidth: 1080, innerHeight: 1920 }, boardPlaylist(TALL_BOX, { canvasWidth: 1080, canvasHeight: 1920 }), "portrait");
  check("vertical zone on a 1080x1920 TV fills the screen at 1:1", place(zone(tv)) === "0px 1152px 1080px 768px", place(zone(tv)));
  check("vertical still on a 1080x1920 TV fills the screen", still(tv) && still(tv).style.backgroundSize === "1080px 1920px");
  check("no rotation hint on a vertical TV that shows a vertical picture", tv.els.orient.className === "orient");
}
// 4. Horizontal board on a vertical TV: empty space above and below.
{
  const tv = start({ innerWidth: 1080, innerHeight: 1920 }, boardPlaylist(LAND_BOX, null));
  check("horizontal zone on a 1080x1920 TV is contained (scale 0.5625, centered)", place(zone(tv)) === "723px 656px 357px 608px", place(zone(tv)));
}

// 5. Viewport report: its own request, once per size, never mixed with other heartbeat fields.
{
  const tv = start({}, boardPlaylist(LAND_BOX, null));
  tv.run(40000);
  const vps = tv.S.posts.filter((b) => b && b.viewport);
  check("the viewport is reported once, in a request of its own", vps.length === 1 && Object.keys(vps[0]).join() === "viewport" && vps[0].viewport.width === 1280 && vps[0].viewport.height === 720, JSON.stringify(vps));
  check("no other report carries the viewport", tv.S.posts.filter((b) => b && !b.viewport).every((b) => !("viewport" in b)));
  check("viewport POST never combines playing, acknowledged, playback or error", vps.every((b) => !("playing" in b) && !("acknowledged" in b) && !("playback" in b) && !("error" in b)));
  check("playback is still acknowledged (playing) alongside the viewport report", tv.S.playing.indexOf(1) !== -1);
  tv.window.innerWidth = 1080; tv.window.innerHeight = 1920;
  tv.fire("window", "resize");
  tv.run(15000);
  const after = tv.S.posts.filter((b) => b && b.viewport);
  check("a new size after rotation is reported once more", after.length === 2 && after[1].viewport.width === 1080 && after[1].viewport.height === 1920, JSON.stringify(after));
  check("the zone follows the new viewport", place(zone(tv)) === "723px 656px 357px 608px", place(zone(tv)));
}
{
  const tv = createPlayer();
  tv.S.playlist = boardPlaylist(LAND_BOX, null);
  tv.S.viewportStatus = 503;
  tv.boot();
  tv.run(120000);
  const vps = tv.S.posts.filter((b) => b && b.viewport);
  check("a failing viewport report is tried at most 3 times and playback continues", vps.length === 3 && zone(tv) && zone(tv).className.indexOf("on") !== -1, vps.length);
}

// 6. Rotation hint: only for a screen set up as vertical whose picture is clearly horizontal; never blocking.
{
  const tv = start({}, boardPlaylist(TALL_BOX, { canvasWidth: 1080, canvasHeight: 1920 }), "portrait");
  check("vertical screen + horizontal picture shows the rotation hint", tv.els.orient.className === "orient on" && /rotat/i.test(tv.els.orient.textContent));
  check("the board keeps playing under the hint", zone(tv) && zone(tv).className.indexOf("on") !== -1 && tv.screen() === "content");
  tv.run(46000);
  check("the hint goes away on its own", tv.els.orient.className === "orient");
  tv.run(60000);
  check("the hint is shown once per page load", tv.els.orient.className === "orient");
}
{
  const tv = start({}, boardPlaylist(TALL_BOX, { canvasWidth: 1080, canvasHeight: 1920 }));
  tv.run(30000);
  check("no hint for a horizontal screen (a vertical board there is only letterboxed)", tv.els.orient.className === "orient");
}
{
  const tv = start({ innerWidth: 1000, innerHeight: 960 }, boardPlaylist(LAND_BOX, null), "portrait");
  check("no hint when the picture is nearly square (not certain)", tv.els.orient.className === "orient");
}

done();
