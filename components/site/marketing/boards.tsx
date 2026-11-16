import type { SampleCopy } from "@/lib/marketing-samples";
import { SAMPLE_MEDIA, sampleImage } from "@/lib/marketing-samples";
import { MutedVideo } from "./muted-video";

/**
 * Sample boards drawn as they would appear full screen on a TV (1920×1080, scaled with container units).
 * Layouts follow real Pekko options: two menu columns + a photo or video panel, a menu + board photo,
 * full-screen uploaded artwork, and promotion slides. Brand colours, logos and fonts stand in for a Brand Kit.
 */

type MenuSection = SampleCopy["ember"]["sections"][number];

function Items({ section, animate }: { section: MenuSection; animate?: boolean }) {
  return (
    <div>
      <div className="bd-sec">{section.name}</div>
      <div className={animate ? "mk-stagger" : undefined}>
        {section.items.map((it) => (
          <div key={it.name} className="bd-item">
            <span className="bd-leader"><span className="bd-item-name">{it.name}</span></span>
            <span className="bd-price">{it.price}</span>
            {it.desc ? <span className="bd-item-desc">{it.desc}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmberLogo() {
  return (
    <svg className="bd-logo" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22.5" fill="none" stroke="#e8a33d" strokeWidth="1.6" />
      <path d="M24 9c2 6 9 9 9 18a9 9 0 0 1-18 0c0-4 2-7 4-9 0 3 1.5 5 3.5 5.5C21 18 22 13 24 9z" fill="#e8a33d" />
      <path d="M24 26c1.4 2.2 3.5 3 3.5 6a3.5 3.5 0 0 1-7 0c0-2 1.6-3.4 3.5-6z" fill="#14100c" />
    </svg>
  );
}

function BeanLogo() {
  return (
    <svg className="bd-logo" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="23" fill="#1d3b2a" />
      <ellipse cx="24" cy="24" rx="9.5" ry="13" transform="rotate(28 24 24)" fill="#c8693d" />
      <path d="M19 13c5 5 1 11 6 15s4 8 2 9" fill="none" stroke="#1d3b2a" strokeWidth="2.2" strokeLinecap="round" transform="rotate(28 24 24) translate(-1 0)" />
    </svg>
  );
}

function PawIcon() {
  return (
    <svg viewBox="0 0 32 32" width="1.4em" height="1.4em" aria-hidden="true" fill="#ffd1c2">
      <ellipse cx="9" cy="11" rx="3" ry="4" /><ellipse cx="16" cy="8" rx="3" ry="4" /><ellipse cx="23" cy="11" rx="3" ry="4" />
      <path d="M16 15c5 0 9 6 9 9.5 0 3-3 3.5-5 2.6-2.4-1-5.6-1-8 0-2 .9-5 .4-5-2.6C7 21 11 15 16 15z" />
    </svg>
  );
}

/** Restaurant: two menu columns + a large photo in the promotion panel (the hero board). */
export function EmberOakBoard({ c, animate, special }: { c: SampleCopy; animate?: boolean; special?: boolean }) {
  const b = c.ember;
  const feature = special ? b.special : b.feature;
  return (
    <div className="bd bd-ember">
      <div className="bd-menu">
        <div className="bd-head">
          <EmberLogo />
          <div><div className="bd-name">EMBER &amp; OAK</div><div className="bd-sub">{b.sub}</div></div>
        </div>
        <div className="bd-cols">
          <Items section={b.sections[0]} animate={animate} />
          <Items section={b.sections[1]} animate={animate} />
        </div>
        <div className="bd-foot">{b.foot}</div>
      </div>
      <div className="bd-media bd-media-shade">
        <img {...sampleImage(special ? SAMPLE_MEDIA.steak : SAMPLE_MEDIA.burger)} alt="" className={animate ? "mk-kenburns" : undefined} fetchPriority={animate ? "high" : undefined} loading={animate ? "eager" : "lazy"} decoding="async" />
        <div className="bd-feature">
          <div className="bd-kicker">{feature.kicker}</div>
          <div className="bd-feature-title">{feature.title}</div>
          <div className="bd-price-tag">{feature.price}</div>
        </div>
      </div>
    </div>
  );
}

/** Coffee shop: logo, brand colours and fonts, menu + board photo. */
export function BeanThereBoard({ c }: { c: SampleCopy }) {
  const b = c.bean;
  return (
    <div className="bd bd-bean">
      <div className="bd-menu">
        <div className="bd-head">
          <div className="bd-brand">
            <BeanLogo />
            <div><div className="bd-name">Bean There</div><div className="bd-sub">{b.sub}</div></div>
          </div>
          <div className="bd-season">{b.season}</div>
        </div>
        <div className="bd-cols">
          <Items section={b.sections[0]} />
          <Items section={b.sections[1]} />
        </div>
        <div className="bd-foot">{b.foot} <b>{b.extra}</b></div>
      </div>
      <div className="bd-media bd-media-shade">
        <img {...sampleImage(SAMPLE_MEDIA.latte)} alt="" loading="lazy" decoding="async" />
        <div className="bd-feature">
          <div className="bd-kicker">{b.feature.kicker}</div>
          <div className="bd-feature-title">{b.feature.title}</div>
          <div className="bd-price-tag">{b.feature.price}</div>
        </div>
      </div>
    </div>
  );
}

/** Pizzeria: two menu columns + a muted video in the media panel. */
export function FornoRossoBoard({ c }: { c: SampleCopy }) {
  const b = c.forno;
  return (
    <div className="bd bd-forno">
      <div className="bd-menu">
        <div className="bd-name">Forno <span>Rosso</span></div>
        <div className="bd-sub">{b.sub}</div>
        <div className="bd-cols">
          <Items section={b.sections[0]} />
          <Items section={b.sections[1]} />
        </div>
        <div className="bd-foot">{b.foot}</div>
      </div>
      <div className="bd-media bd-media-shade">
        <MutedVideo src={SAMPLE_MEDIA.pizzaVideo} poster={SAMPLE_MEDIA.pizzaPoster} />
        <div className="bd-feature">
          <div className="bd-kicker">{b.feature.kicker}</div>
          <div className="bd-feature-title">{b.feature.title}</div>
          <div className="bd-price-tag">{b.feature.price}</div>
        </div>
      </div>
    </div>
  );
}

/** Full-screen artwork a customer designed elsewhere and uploaded as one image. */
export function BrunchArtwork({ c }: { c: SampleCopy }) {
  const b = c.brunch;
  return (
    <div className="bd-art bd-brunch">
      <div className="bd-sun" />
      <div className="bd-photo"><img {...sampleImage(SAMPLE_MEDIA.pancakes)} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>
      <div className="bd-copy">
        <div className="bd-script">{b.script}</div>
        <div className="bd-title">{b.title}</div>
        <div className="bd-when">{b.when}</div>
        <ul>{b.items.map((i) => <li key={i.name}><span>{i.name}</span><span>{i.price}</span></li>)}</ul>
      </div>
      <div className="bd-sticker">{b.stickerTop}<b>{b.stickerPrice}</b></div>
    </div>
  );
}

export function ColdBrewArtwork({ c }: { c: SampleCopy }) {
  const b = c.coldbrew;
  return (
    <div className="bd-art bd-coldbrew">
      <img {...sampleImage(SAMPLE_MEDIA.coldBrew, "full")} alt="" loading="lazy" decoding="async" />
      <div className="bd-copy">
        <div className="bd-brandline">Bean There</div>
        <div className="bd-title">{b.title}</div>
        <div className="bd-deal"><b>{b.price}</b><span>{b.priceNote}</span></div>
        <div className="bd-small">{b.small}</div>
      </div>
    </div>
  );
}

export function SmokeWheelsBoard({ c }: { c: SampleCopy }) {
  const b = c.truck;
  return (
    <div className="bd bd-truck">
      <div className="bd-menu">
        <div className="bd-name">Smoke <span>&amp;</span> Wheels</div>
        <div className="bd-sec">{b.section}</div>
        <div>
          {b.items.map((it) => (
            <div key={it.name} className="bd-item">
              <span className="bd-leader"><span className="bd-item-name">{it.name}</span></span>
              <span className="bd-price">{it.price}</span>
            </div>
          ))}
        </div>
        <div className="bd-banner"><span>{b.bannerLeft}</span><span>{b.bannerRight}</span></div>
      </div>
      <div className="bd-media"><img {...sampleImage(SAMPLE_MEDIA.ribs)} alt="" loading="lazy" decoding="async" /></div>
    </div>
  );
}

export function PawsBoard({ c }: { c: SampleCopy }) {
  const b = c.paws;
  return (
    <div className="bd bd-paws">
      <div className="bd-copy">
        <div className="bd-name"><PawIcon /> PAWS &amp; CO.</div>
        <div className="bd-title">{b.title}</div>
        <div className="bd-detail">{b.detail}</div>
        <div className="bd-badge">{b.badge}</div>
      </div>
      <div className="bd-media"><img {...sampleImage(SAMPLE_MEDIA.beagle)} alt="" loading="lazy" decoding="async" /></div>
    </div>
  );
}

export function LindenBoard({ c }: { c: SampleCopy }) {
  const b = c.linden;
  return (
    <div className="bd-art bd-linden">
      <img {...sampleImage(SAMPLE_MEDIA.bags, "full")} alt="" loading="lazy" decoding="async" />
      <div className="bd-copy">
        <div className="bd-name">LINDEN &amp; CO.</div>
        <div className="bd-title">{b.title}</div>
        <div className="bd-big">30%<small>{b.off}</small></div>
        <div className="bd-small">{b.small}</div>
      </div>
    </div>
  );
}

/** What the TV shows before it is paired: the player address and a six-digit code. */
export function PairingScreen({ url, code, hint }: { url: string; code: string; hint: string }) {
  return (
    <div className="bd-pair">
      <div className="bd-url">{url}</div>
      <div className="bd-code">{code}</div>
      <div className="bd-hint">{hint}</div>
    </div>
  );
}
