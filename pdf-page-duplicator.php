<?php
/**
 * Plugin Name: PDF Page Duplicator (Client-side)
 * Description: Dupliziert PDF-Seiten im Browser (ohne Server-Upload). Modernes, mobiles UI, Drag&Drop, Fortschritt, Seitenbereich.
 * Version:     1.8.0
 * Author:      Remo Lepori
 * License:     GPLv2 or later
 */

if (!defined('ABSPATH')) exit;

final class PPD_Pdf_Page_Duplicator {
  const HANDLE = 'ppd-pdf-page-duplicator';

  public function __construct() {
    add_action('wp_enqueue_scripts', [$this, 'register_assets']);
    add_shortcode('pdf_page_duplicator', [$this, 'shortcode']);
  }

  public function register_assets() {
    wp_register_script(
      'pdf-lib',
      'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
      [],
      '1.17.1',
      true
    );

wp_register_script(
  'pdfjs',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  [],
  '3.11.174',
  true
);

    wp_register_script(
      self::HANDLE,
      plugins_url('assets/pdf-page-duplicator.js', __FILE__),
      ['pdf-lib'],
      '1.5.0',
      true
    );

    wp_register_style(
      self::HANDLE,
      plugins_url('assets/pdf-page-duplicator.css', __FILE__),
      [],
      '1.5.0'
    );
  }

  public function shortcode($atts = []) {
    $atts = shortcode_atts([
      'title' => 'PDF-Seiten duplizieren',
    ], $atts, 'pdf_page_duplicator');

wp_enqueue_script('pdf-lib');
wp_enqueue_script('pdfjs');
wp_enqueue_script(self::HANDLE);
wp_enqueue_style(self::HANDLE);

    ob_start(); ?>
    <div class="ppd-wrap" data-ppd-root>
      <div class="ppd-header">
        <h3 class="ppd-title"><?php echo esc_html($atts['title']); ?></h3>
      </div>

      <div class="ppd-body">
        <input id="ppd-file" type="file" accept="application/pdf" hidden>

<div class="ppd-layout">
  <div class="ppd-main">

        <div class="ppd-grid">
          <div class="ppd-card ppd-span-2">
            <span class="ppd-heading">1. PDF-Datei hochladen</span>
            <div class="ppd-drop" id="ppd-drop" role="button" tabindex="0" aria-label="PDF per Drag & Drop auswählen">
              <div class="ppd-drop-left">
<div class="ppd-ico" aria-hidden="true">
  <svg viewBox="0 0 91.201 91.201" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
    <g>
      <g fill="currentColor">
        <path d="M45.182,37.845c-1.118,0-1.842,0.099-2.269,0.197v14.502c0.427,0.099,1.118,0.099,1.743,0.099
          c4.538,0.032,7.497-2.467,7.497-7.76C52.186,40.279,49.488,37.845,45.182,37.845z"/>
        <path d="M25.817,37.78c-1.021,0-1.71,0.099-2.072,0.197v6.543c0.428,0.099,0.953,0.132,1.677,0.132
          c2.664,0,4.308-1.348,4.308-3.617C29.73,38.996,28.317,37.78,25.817,37.78z"/>
        <path d="M58.984,0H12.336v91.201h66.529V27.05L55.23,10.73L58.984,0z M32.656,46.165c-1.71,1.61-4.241,2.335-7.2,2.335
          c-0.659,0-1.25-0.033-1.711-0.1v7.924H18.78V34.459c1.545-0.264,3.715-0.461,6.773-0.461c3.091,0,5.294,0.592,6.775,1.776
          c1.414,1.118,2.367,2.959,2.367,5.129C34.695,43.074,33.971,44.915,32.656,46.165z M60.764,34.163h13.549v4.11h-8.517v5.063h7.958
          v4.076h-7.958v8.912h-5.032V34.163z M57.479,44.717c0,4.242-1.543,7.168-3.682,8.977c-2.335,1.94-5.887,2.862-10.226,2.862
          c-2.598,0-4.44-0.166-5.689-0.329V34.459c1.842-0.296,4.242-0.461,6.775-0.461c4.208,0,6.938,0.756,9.076,2.369
          C56.033,38.076,57.479,40.805,57.479,44.717z"/>
        <polygon points="63.652,0 60.613,8.694 78.865,21.297"/>
      </g>
    </g>
  </svg>
</div>
                <div class="ppd-drop-text">
                  <div class="ppd-drop-strong">PDF hierher ziehen oder klicken</div>
                  <div id="ppd-filemeta" class="ppd-filemeta">Keine Datei ausgewählt</div>
                  <div id="ppd-pagecount" class="ppd-pagecount"></div>
                </div>
              </div>
              <div class="ppd-chip">Nur .pdf Dateien</div>
            </div>
          </div>




          <div class="ppd-card ppd-span-2">
            <span class="ppd-heading">2. Modus wählen</span>
            <div class="ppd-radio">
              <label>
                <input type="radio" name="ppd-mode" value="interleave">
                <div>
                  <div class="ppd-radio-title">Nacheinander duplizieren</div>
                  <div class="ppd-radio-desc">1, 1, 2, 2, 3, 3,…</div>
                </div>
              </label>
              <label>
                <input type="radio" name="ppd-mode" value="append">
                <div>
                  <div class="ppd-radio-title">Duplikate ans Ende</div>
                  <div class="ppd-radio-desc">1, 2, 3,… 1, 2, 3,…</div>
                </div>
              </label>
		<label>
  			<input type="radio" name="ppd-mode" value="two_up">
  			<div>
    				<div class="ppd-radio-title">2 Seiten auf 1 Seite</div>
    				<div class="ppd-radio-desc">1+2, 3+4, 5+6,…</div>
  			</div>
		</label>

		<label>
  			<input type="radio" name="ppd-mode" value="two_up_sorted" checked>
  			<div>
    				<div class="ppd-radio-title">2 Seiten auf 1 Seite (sortiert)</div>
    				<div class="ppd-radio-desc">1+1, 2+2, 3+3,…</div>
  			</div>
		</label>
            </div>
          </div>





          <div class="ppd-card ppd-span-2">
            <span class="ppd-heading">3. Optionen festlegen</span>
	
	<div class="ppd-card-innercontainer">
	<div class="ppd-card-innercontainer-item">
            <span class="ppd-label">Seitenbereich</span>
            <div class="ppd-range">
              <span class="ppd-help" style="margin:0">Von</span>
              <input id="ppd-range-start" class="ppd-input" type="number" min="1" step="1" placeholder="1">
              <span class="ppd-help" style="margin:0">bis</span>
              <input id="ppd-range-end" class="ppd-input" type="number" min="1" step="1" placeholder="z.B. 10">
            </div>
            <div class="ppd-help">Leer lassen, um alle Seiten zu verwenden.</div>
          </div>
	

<div id="ppd-copies-card" class="ppd-card-innercontainer-item">

  <span id="ppd-copies-label" class="ppd-label">Zusätzliche Kopien pro Seite</span>
  <div class="ppd-row">
    <input id="ppd-copies" class="ppd-input" type="number" min="1" max="50" value="1">
    <div id="ppd-copies-help" class="ppd-help" style="margin:0">1 = jede Seite einmal zusätzlich.</div>
  </div>

</div>




<div class="ppd-card-innercontainer-item">

<span class="ppd-label">Ausgabeformat</span>
  <div class="ppd-radio ppd-radio-format">
    <label>
      <input type="radio" name="ppd-format" value="original" checked>
      <div>
        <div class="ppd-radio-title">Originalformat</div>
        <div class="ppd-radio-desc">Wie Vorlage</div>
      </div>
    </label>

    <label>
      <input type="radio" name="ppd-format" value="a4">
      <div>
        <div class="ppd-radio-title">A4</div>
        <div class="ppd-radio-desc">Skaliert auf A4</div>
      </div>
    </label>

    <label>
      <input type="radio" name="ppd-format" value="a3">
      <div>
        <div class="ppd-radio-title">A3</div>
        <div class="ppd-radio-desc">Skaliert auf A3</div>
      </div>
    </label>
  </div>

</div>






</div>
</div>

        </div>


  </div>

  <aside class="ppd-side">
    <div class="ppd-card ppd-preview-card">
      <span class="ppd-heading">4. Vorschau prüfen</span>

      <div id="ppd-preview-progress" class="ppd-progress" style="display:none">
        <div class="ppd-progress-top">
          <span id="ppd-preview-progress-text"></span>
          <span id="ppd-preview-progress-pct"></span>
        </div>
        <div class="ppd-bar"><span id="ppd-preview-progress-bar"></span></div>
      </div>


<div id="ppd-preview-empty" class="ppd-preview-empty">
  Lade eine PDF-Datei hoch, um eine Vorschau zu erhalten.
</div>


      <div id="ppd-preview" class="ppd-preview"></div>

<div id="ppd-preview-count" class="ppd-preview-count">
  <span class="ppd-preview-badge" id="ppd-preview-count-new">Neu: – Seiten</span>
  <span class="ppd-preview-badge" id="ppd-preview-count-old">Original: – Seiten</span>
</div>

    </div>
  </aside>
</div>

	<div class="ppd-card ppd-span-2 ppd-card-actions">
      <span class="ppd-heading ppd-heading-outside">5. PDF exportieren</span>
		<div class="ppd-actions-container">
  		<div class="ppd-actions">
    		<button id="ppd-run" class="ppd-btn ppd-btn-primary" type="button">PDF erstellen</button>
    		<button id="ppd-reset" class="ppd-btn ppd-btn-secondary" type="button">Zurücksetzen</button>
  		</div>

		<div class="ppd-open-container">
			
  				<label class="ppd-checkbox">
    					<input type="checkbox" id="ppd-download-after-export" value="1" checked>
    					<span>Herunterladen</span>
  				</label>


  				<label class="ppd-checkbox">
    					<input type="checkbox" id="ppd-open-after-export" value="1" checked>
    					<span>Im Browser öffnen</span>
  				</label>
		</div>

		</div>

            <div id="ppd-progress" class="ppd-progress" style="display:none">
              <div class="ppd-progress-top">
                <span id="ppd-progress-text"></span>
                <span id="ppd-progress-pct"></span>
              </div>
              <div class="ppd-bar"><span id="ppd-progress-bar"></span></div>
            </div>

           <div id="ppd-status" class="ppd-status" style="display:none"></div>
	</div>
        <div class="ppd-disclaimer">
        	<p class="ppd-subtitle">Alles läuft lokal im Browser. Keine Datei wird auf dem Server gespeichert.</p>
	</div>
      </div>
    </div>
    <?php
    return ob_get_clean();
  }
}

new PPD_Pdf_Page_Duplicator();
