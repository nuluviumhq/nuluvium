// One-colour marks of the companies behind the stock tokens on the landing Markets row (nominative use:
// they only identify the underlying stock). Shapes are unchanged from the public files on Wikimedia
// Commons (NVIDIA_logo.svg, eye only; Tesla_T_symbol.svg); colour comes from currentColor. The trademarks
// belong to their owners and Nuluvium is not affiliated with them (the page says so under the row).

export function NvidiaMark() {
  return (
    <svg className="stock-mark" viewBox="0 0 45.6 30" aria-hidden="true">
      <path fill="currentColor" d="M16.889,8.985L16.889,6.28C17.151,6.26 17.417,6.247 17.687,6.238C25.087,6.006 29.942,12.597 29.942,12.597C29.942,12.597 24.698,19.879 19.076,19.879C18.333,19.882 17.594,19.764 16.889,19.529L16.889,11.325C19.769,11.673 20.349,12.945 22.081,15.833L25.933,12.585C25.933,12.585 23.121,8.897 18.381,8.897C17.866,8.897 17.373,8.933 16.889,8.985ZM16.889,0.047L16.889,4.09C17.154,4.069 17.42,4.052 17.687,4.042C27.977,3.696 34.682,12.482 34.682,12.482C34.682,12.482 26.982,21.846 18.959,21.846C18.224,21.846 17.535,21.778 16.889,21.663L16.889,24.161C17.442,24.231 18.015,24.273 18.613,24.273C26.078,24.273 31.477,20.461 36.705,15.948C37.572,16.642 41.121,18.331 41.85,19.071C36.879,23.231 25.295,26.586 18.727,26.586C18.113,26.584 17.5,26.552 16.889,26.49L16.889,30L45.264,30L45.264,0.047L16.889,0.047ZM16.889,19.529L16.889,21.662C9.984,20.432 8.067,13.254 8.067,13.254C8.067,13.254 11.383,9.58 16.889,8.985L16.889,11.325L16.878,11.324C13.988,10.977 11.731,13.677 11.731,13.677C11.731,13.677 12.996,18.221 16.889,19.529ZM4.625,12.943C4.625,12.943 8.717,6.903 16.889,6.28L16.889,4.088C7.838,4.815 0,12.48 0,12.48C0,12.48 4.439,25.313 16.889,26.488L16.889,24.16C7.753,23.011 4.625,12.943 4.625,12.943Z" />
    </svg>
  );
}

export function TeslaMark() {
  return (
    <svg className="stock-mark" viewBox="45.34 63.797 255.084 254.002" aria-hidden="true">
      <path fill="currentColor" d="M 173.146,317.299 208.622,117.78 c 33.815,0 44.481,3.708 46.021,18.843 0,0 22.684,-8.458 34.125,-25.636 C 244.122,90.299 199.263,89.366 199.263,89.366 l -26.176,31.882 0.059,-0.004 -26.176,-31.883 c 0,0 -44.86,0.934 -89.5,21.622 11.431,17.178 34.124,25.636 34.124,25.636 1.549,-15.136 12.202,-18.844 45.79,-18.868 l 35.762,199.548" />
      <path fill="currentColor" d="m 173.132,80.157 c 36.09,-0.276 77.399,5.583 119.687,24.014 5.652,-10.173 7.105,-14.669 7.105,-14.669 C 253.697,71.213 210.406,64.954 173.127,64.797 135.85,64.954 92.561,71.214 46.34,89.502 c 0,0 2.062,5.538 7.1,14.669 42.28,-18.431 83.596,-24.29 119.687,-24.014 h 0.005" />
    </svg>
  );
}

/** SPY has no public mark to use: a plain typographic badge in the same one colour. */
export function SpyBadge() {
  return (
    <svg className="stock-mark" viewBox="0 0 30 30" aria-hidden="true">
      <circle cx="15" cy="15" r="14" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="15" cy="15" r="11.4" fill="none" stroke="currentColor" strokeWidth="0.5" />
      <text x="15" y="18.6" textAnchor="middle" fontFamily="var(--serif)" fontSize="9.6" letterSpacing="-0.2" fill="currentColor">500</text>
    </svg>
  );
}
