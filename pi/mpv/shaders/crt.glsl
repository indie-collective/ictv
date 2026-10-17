// ICTV CRT look, port of the body.crt rules in public/style.css:
// scanlines, RGB stripe tint, vignette and a procedural TV bezel (approximates bezel.png).

//!HOOK OUTPUT
//!BIND HOOKED
//!DESC ICTV CRT

#define SCANLINE_DARKEN 0.5625  // two stacked rgba(0,0,0,.25) lines
#define TINT_STRENGTH 0.06      // red/blue stripe alpha (green is a third of it)
#define VIGNETTE_START 0.6
#define BEZEL_RADIUS 0.12       // corner radius, in half-heights

vec4 hook() {
    vec2 uv = HOOKED_pos;
    vec2 px = uv * HOOKED_size;
    vec4 c = HOOKED_tex(uv);

    // Scanlines: every second pixel row darkened
    if (mod(floor(px.y), 2.0) >= 1.0)
        c.rgb *= SCANLINE_DARKEN;

    // RGB stripes, 3px period, applied twice like the CSS
    float col = mod(floor(px.x), 3.0);
    vec3 tint = col < 0.5 ? vec3(1.0, 0.0, 0.0) : (col < 1.5 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0));
    float a = col < 0.5 || col >= 1.5 ? TINT_STRENGTH : TINT_STRENGTH / 3.0;
    c.rgb = mix(c.rgb, tint, a);
    c.rgb = mix(c.rgb, tint, a);

    // Vignette: radial-gradient(ellipse, transparent 60%, #000 100%)
    float d = length(uv - 0.5) * 1.41421356;
    c.rgb *= 1.0 - clamp((d - VIGNETTE_START) / (1.0 - VIGNETTE_START), 0.0, 1.0);

    // Bezel: rounded opening whose edges bow outwards towards the middle
    vec2 ap = abs(uv * 2.0 - 1.0);
    vec2 inner = vec2(1.0 - 2.0 * (0.028 + 0.015 * ap.y * ap.y),
                      1.0 - 2.0 * (0.0225 + 0.018 * ap.x * ap.x));
    float aspect = HOOKED_size.x / HOOKED_size.y;
    vec2 q = ap / inner * vec2(aspect, 1.0);
    vec2 e = q - (vec2(aspect, 1.0) - BEZEL_RADIUS);
    float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - BEZEL_RADIUS;
    float aa = 2.0 / HOOKED_size.y;
    c.rgb *= 1.0 - smoothstep(-aa, aa, sd);

    return c;
}
