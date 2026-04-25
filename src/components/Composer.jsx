import React, { useEffect, useRef, useState } from 'react';
import * as I from '../icons.jsx';
import { classNames } from '../lib/utils.js';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB per image

export default function Composer({ state, dispatch, onSend, streaming, onStop, currentModel, ocrModel }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [error, setError] = useState('');
  const taRef = useRef(null);
  const fileRef = useRef(null);

  const canAttachImage = !!(currentModel?.vision || ocrModel?.vision);

  useEffect(() => {
    autoresize();
  }, [text]);

  function autoresize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }

  function send() {
    if (streaming) return;
    if (!text.trim() && images.length === 0) return;
    onSend({ text: text.trim(), images });
    setText('');
    setImages([]);
    setError('');
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }

  async function pickFiles(files) {
    if (!files || !files.length) return;
    setError('');
    const next = [...images];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > MAX_IMAGE_BYTES) {
        setError(`图片「${f.name}」超过 4MB，已跳过`);
        continue;
      }
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      next.push(url);
    }
    setImages(next);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        {error && (
          <div style={{ fontSize: 12, color: 'var(--danger)', padding: '4px 0' }}>{error}</div>
        )}
        {images.length > 0 && (
          <div className="composer-images">
            {images.map((src, i) => (
              <div key={i} className="composer-image" style={{ backgroundImage: `url(${src})` }}>
                <button
                  className="composer-image-remove"
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                  title="移除"
                >
                  <I.X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          className="composer-textarea"
          rows={1}
          placeholder={currentModel ? '给 YK AI 发送消息' : '尚未配置可用模型'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          disabled={!currentModel}
        />
        <div className="composer-actions">
          {canAttachImage && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => pickFiles(e.target.files)}
              />
              <button className="icon-btn" title="附加图片" onClick={() => fileRef.current?.click()}>
                <I.Paperclip size={18} />
              </button>
            </>
          )}
          <button
            className={classNames('composer-pill', state.webSearchEnabled && 'active')}
            title={state.webSearchEnabled ? '搜索已开启（点击关闭）' : '点击开启网络搜索'}
            onClick={() => dispatch({ type: 'toggleWebSearch' })}
          >
            <I.Globe size={14} />
            <span>搜索</span>
          </button>
          <div className="composer-actions-spacer" />
          {streaming ? (
            <button className="send-btn stop" onClick={onStop} title="停止生成">
              <I.Stop size={14} />
            </button>
          ) : (
            <button
              className="send-btn"
              disabled={(!text.trim() && images.length === 0) || !currentModel}
              onClick={send}
              title="发送"
            >
              <I.ArrowUp size={18} />
            </button>
          )}
        </div>
      </div>
      <p className="composer-disclaimer">YK AI 可能会出错。请核对重要信息。</p>
    </div>
  );
}
