import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import './QrScanner.css';

const READER_ID = 'qr-reader-region';

/**
 * QrScanner - wraps html5-qrcode in a component that starts the camera on mount
 * and shuts it down cleanly on unmount.
 *
 * Mount this only when the user asks to scan. The browser prompts for camera
 * permission the moment the stream starts, and a permission dialog nobody asked
 * for is a good way to get a page dismissed.
 */
function QrScanner({ onScan, onClose }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(READER_ID);
    scannerRef.current = scanner;

    const start = async () => {
      try {
        await scanner.start(
          { facingMode: 'environment' }, // rear camera on a phone
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            // Stop before handing control back, so the camera light goes out
            // immediately rather than lingering behind the results.
            scanner
              .stop()
              .catch(() => {})
              .finally(() => onScan(decodedText));
          },
          () => {
            // Per-frame decode misses are normal and extremely frequent.
            // Swallow them; only start() failures are worth surfacing.
          }
        );
      } catch (err) {
        if (cancelled) return;
        console.error('Camera start failed:', err);
        setError(
          'Could not access the camera. Check browser permissions, and note that ' +
            'most browsers only allow camera access over HTTPS or on localhost.'
        );
      }
    };

    start();

    return () => {
      cancelled = true;
      const active = scannerRef.current;
      if (!active) return;
      // isScanning guards against stop() throwing when start() never succeeded.
      if (active.isScanning) {
        active.stop().catch(() => {}).finally(() => active.clear().catch(() => {}));
      } else {
        active.clear().catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div className="qr-scanner">
      <div id={READER_ID} className="qr-scanner-region" />
      {error ? (
        <p className="qr-scanner-error">{error}</p>
      ) : (
        <p className="qr-scanner-hint">Point the camera at a product QR code.</p>
      )}
      <button type="button" className="qr-scanner-close" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}

export default QrScanner;
