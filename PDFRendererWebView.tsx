import React, { useMemo } from "react";
import { ViewStyle } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

interface PDFRendererWebViewProps {
  pdfFilePath: string; // file:/// path to PDF
  readAccessPath?: string; // directory path granting read access (iOS)
  fullWidth: number; // target pixel width for full image
  quality?: number; // 0..1
  maxPages?: number; // safety cap
  onMeta?: (meta: { totalPages: number }) => void;
  onPage?: (data: { pageNumber: number; width: number; height: number; base64: string }) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  style?: ViewStyle;
}

const PDF_JS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54";

export default function PDFRendererWebView({
  pdfFilePath,
  readAccessPath,
  fullWidth,
  quality = 0.8,
  maxPages = 50,
  onMeta,
  onPage,
  onDone,
  onError,
  style,
}: PDFRendererWebViewProps) {
  const injected = useMemo(() => `
    (function() {
      window.__PDF_CONFIG__ = {
        filePath: ${JSON.stringify(pdfFilePath)},
        fullWidth: ${Math.max(200, Math.floor(fullWidth))},
        quality: ${quality},
        maxPages: ${maxPages},
        cdn: '${PDF_JS_CDN}'
      };
    })();
  `, [pdfFilePath, fullWidth, quality, maxPages]);

  const html = useMemo(() => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>html,body{margin:0;padding:0;background:#000;}</style>
  <script src="${PDF_JS_CDN}/pdf.min.js"></script>
  <script>
    function postMessageRN(payload){
      try{window.ReactNativeWebView.postMessage(JSON.stringify(payload));}catch(e){}
    }
    async function loadArrayBufferFromFile(path){
      try{
        if (window.fetch){
          const res = await fetch(path);
          const buf = await res.arrayBuffer();
          return buf;
        }
      }catch(e){}
      return new Promise(function(resolve,reject){
        try{
          var xhr = new XMLHttpRequest();
          xhr.open('GET', path, true);
          xhr.responseType = 'arraybuffer';
          xhr.onload = function(){ if (xhr.status >= 200 && xhr.status < 300){ resolve(xhr.response); } else { reject(new Error('HTTP '+xhr.status)); } };
          xhr.onerror = function(){ reject(new Error('XHR error')); };
          xhr.send();
        }catch(err){ reject(err); }
      });
    }
    window.addEventListener('load', function(){
      try{ if (window['pdfjsLib']) { pdfjsLib.GlobalWorkerOptions.workerSrc='${PDF_JS_CDN}/pdf.worker.min.js'; } }catch(e){}
      setTimeout(startRender,0);
    });
    async function startRender(){
      try{
        var cfg = window.__PDF_CONFIG__||{};
        var ab = await loadArrayBufferFromFile(cfg.filePath);
        var uint8 = new Uint8Array(ab);
        var loadingTask = pdfjsLib.getDocument({ data: uint8 });
        var pdf = await loadingTask.promise;
        var total = Math.min(pdf.numPages, cfg.maxPages||50);
        postMessageRN({type:'meta', totalPages: total});
        for (var pageNum=1; pageNum<=total; pageNum++){
          var page = await pdf.getPage(pageNum);
          var vp1 = page.getViewport({ scale: 1.0 });
          var scale = (cfg.fullWidth||800) / vp1.width;
          var viewport = page.getViewport({ scale: scale });
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          var dataUrl = canvas.toDataURL('image/jpeg', cfg.quality||0.8);
          var base64img = dataUrl.split(',')[1]||'';
          postMessageRN({ type:'page', pageNumber: pageNum, width: canvas.width, height: canvas.height, base64: base64img });
          canvas.width=0; canvas.height=0; canvas=null; ctx=null;
          await new Promise(r=>setTimeout(r,0));
        }
        postMessageRN({type:'done'});
      }catch(err){
        postMessageRN({type:'error', message: (err&&err.message)||'Unknown error'});
      }
    }
  </script>
</head>
<body></body>
</html>`, [pdfFilePath, fullWidth, quality, maxPages]);

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'meta') onMeta?.({ totalPages: data.totalPages });
      else if (data.type === 'page') onPage?.({ pageNumber: data.pageNumber, width: data.width, height: data.height, base64: data.base64 });
      else if (data.type === 'done') onDone?.();
      else if (data.type === 'error') onError?.(String(data.message||'Render error'));
    } catch {
      // ignore non-JSON
    }
  };

  return (
    <WebView
      originWhitelist={["*"]}
      onMessage={handleMessage}
      injectedJavaScriptBeforeContentLoaded={injected}
      source={{ html }}
      javaScriptEnabled
      allowFileAccess
      allowingReadAccessToURL={readAccessPath}
      onError={() => onError?.('WebView error')}
      onHttpError={() => onError?.('WebView HTTP error')}
      style={[{ position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999, top: -9999 }, style]}
    />
  );
}
