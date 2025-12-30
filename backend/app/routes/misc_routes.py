from flask import Blueprint, jsonify, g, current_app, request, Response
from ..decorators import token_required, admin_required
import os
import json
import hashlib
from pathlib import Path
from urllib import request as urlrequest
from urllib.error import URLError, HTTPError
import base64
import time
import traceback
import uuid
from urllib import request as _ureq
from urllib import error as _uerr
import json as _json

misc_bp = Blueprint('misc_bp', __name__)

@misc_bp.route('/api/public')
def public_resource():
    return jsonify(message="This is a public resource. Accessible to everyone.")

@misc_bp.route('/api/protected')
@token_required
def protected_resource():
    username = g.current_user['username']
    return jsonify(message=f"Hello {username}! This is a protected resource. You are logged in.")

@misc_bp.route('/api/admin')
@admin_required
def admin_resource():
    username = g.current_user['username']
    return jsonify(message=f"Hello admin {username}! This is an admin-only resource.")


@misc_bp.route('/api/admin/cleanup-ghosts', methods=['POST'])
@admin_required
def cleanup_ghosts():
    """
    One-click cleanup for ghost data across admin-managed collections.
    - Removes invalid word documents (missing/empty 'word').
    - Removes ghost entries from all wordbooks (entries.word not in words collection).
    Returns a summary of changes.
    """
    summary = {
        'invalid_words_deleted': 0,
        'duplicate_words_deleted': 0,
        'wordbooks_affected': 0,
        'entries_removed': 0,
        'wordbook_duplicate_entries_removed': 0
    }

    try:
        # 1) Delete invalid word docs (missing/empty/non-ASCII)
        res = current_app.db.words.delete_many({
            '$or': [
                {'word': {'$exists': False}},
                {'word': {'$type': 10}},  # null
                {'word': ''},
                {'word': {'$regex': '^\\s+$'}},
                {'word': {'$regex': '[^\\x00-\\x7F]'}}  # contains non-ASCII characters
            ]
        })
        summary['invalid_words_deleted'] = getattr(res, 'deleted_count', 0)

        # 2) Deduplicate words collection by identical 'word' value
        try:
            dup_groups = list(current_app.db.words.aggregate([
                { '$group': { '_id': '$word', 'ids': { '$push': '$_id' }, 'count': { '$sum': 1 } } },
                { '$match': { 'count': { '$gt': 1 } } }
            ]))
            to_delete_ids = []
            for grp in dup_groups:
                ids = grp.get('ids', [])
                if not ids:
                    continue
                # Keep the earliest inserted (min ObjectId), delete the rest
                keep_id = min(ids)
                to_delete_ids.extend([i for i in ids if i != keep_id])
            if to_delete_ids:
                del_res = current_app.db.words.delete_many({'_id': {'$in': to_delete_ids}})
                summary['duplicate_words_deleted'] = getattr(del_res, 'deleted_count', len(to_delete_ids))
        except Exception:
            pass

        # 3) Build existing words set
        existing_words = set(
            doc.get('word') for doc in current_app.db.words.find({}, {'word': 1}) if doc.get('word')
        )

        # 4) Remove ghost and duplicate entries from all wordbooks
        cursor = current_app.db.wordbooks.find({}, {'entries': 1})
        for wb in cursor:
            entries = wb.get('entries', []) or []
            # Remove ghost entries
            book_words = [e.get('word') for e in entries if isinstance(e, dict) and e.get('word')]
            ghost_set = set(w for w in book_words if w not in existing_words)
            removed_ghosts = 0
            if ghost_set:
                before = len(entries)
                entries = [e for e in entries if e.get('word') not in ghost_set]
                removed_ghosts = before - len(entries)
            # Deduplicate identical word entries (keep first occurrence)
            seen = set()
            deduped = []
            removed_dups = 0
            for e in entries:
                w = e.get('word') if isinstance(e, dict) else None
                if not w:
                    continue
                if w in seen:
                    removed_dups += 1
                    continue
                seen.add(w)
                deduped.append(e)
            if removed_ghosts or removed_dups:
                current_app.db.wordbooks.update_one({'_id': wb['_id']}, {'$set': {'entries': deduped}})
                summary['wordbooks_affected'] += 1
                summary['entries_removed'] += removed_ghosts
                summary['wordbook_duplicate_entries_removed'] += removed_dups

        return jsonify({'message': 'Ghost cleanup completed', 'summary': summary}), 200
    except Exception as e:
        return jsonify({'message': 'Ghost cleanup failed', 'error': str(e), 'summary': summary}), 500


def _tts_cache_dir() -> Path:
    d = Path(os.getenv('TTS_CACHE_DIR', '/tmp/piper_cache'))
    try:
        d.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    return d


def _tts_cache_key(voice_type: str, encoding: str, speed_ratio: float, text: str) -> str:
    base = f"{voice_type}|{encoding}|{speed_ratio}|{text}".encode('utf-8')
    return hashlib.sha1(base).hexdigest()


def _tts_cache_path(key: str, encoding: str) -> Path:
    ext = '.mp3' if encoding.lower() == 'mp3' else (
        '.wav' if encoding.lower() == 'wav' else (
            '.ogg' if encoding.lower() == 'ogg' else f".{encoding.lower()}"
        )
    )
    return _tts_cache_dir() / f"{key}{ext}"


def _prune_cache(max_bytes: int):
    d = _tts_cache_dir()
    try:
        files = [p for p in d.iterdir() if p.is_file()]
    except Exception:
        return
    total = 0
    infos = []
    for f in files:
        try:
            s = f.stat()
            total += s.st_size
            infos.append((f, s.st_mtime, s.st_size))
        except Exception:
            continue
    if total <= max_bytes:
        return
    # delete oldest by mtime until under limit
    infos.sort(key=lambda x: x[1])
    for f, _, size in infos:
        try:
            f.unlink(missing_ok=True)
        except Exception:
            pass
        total -= size
        if total <= max_bytes:
            break


def _infer_content_type(encoding: str) -> str:
    enc = (encoding or 'mp3').lower()
    if enc == 'mp3':
        return 'audio/mpeg'
    if enc == 'wav':
        return 'audio/wav'
    if enc == 'ogg':
        return 'audio/ogg'
    return 'application/octet-stream'


def _cache_key(text: str, voice: str, encoding: str, speed: float) -> str:
    return _tts_cache_key(voice, encoding, speed, text)


def _cache_path_for(key: str, encoding: str) -> Path:
    return _tts_cache_path(key, encoding)


def _prune_cache_if_needed():
    try:
        max_bytes = int(os.getenv('TTS_CACHE_MAX_BYTES', str(3 * 1024 * 1024 * 1024)))
    except Exception:
        max_bytes = 3 * 1024 * 1024 * 1024
    _prune_cache(max_bytes)


def _mask_token(tok: str) -> str:
    try:
        if not tok:
            return ''
        t = str(tok)
        if len(t) <= 8:
            return '***'
        return f"{t[:4]}***{t[-4:]}"
    except Exception:
        return '***'


def _truncate_text(s: str, max_len: int = 200) -> str:
    try:
        if s is None:
            return ''
        text = str(s)
        return text if len(text) <= max_len else text[:max_len] + '…'
    except Exception:
        return ''


@misc_bp.route('/api/tts/say', methods=['POST'])
@token_required
def tts_say():
    """
    Unified TTS endpoint (Volcano)
    - Simple payload: { text, length_scale? }
    - Vendor schema: { app, user, audio, request }
    - Upstream requires Authorization: Bearer;ACCESS_TOKEN and appid/token in body.app
    Defaults: voice BV503_streaming, encoding mp3, rate 24000
    """
    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()

    app_cfg = data.get('app') or {}
    user_cfg = data.get('user') or {}
    audio_cfg = data.get('audio') or {}
    req_cfg = data.get('request') or {}

    # Backward compat: simple schema
    if text and not app_cfg and not audio_cfg and not req_cfg:
        try:
            length_scale = float(data.get('length_scale', 1.0) or 1.0)
        except Exception:
            length_scale = 1.0
        # For max compatibility with working curl, do NOT send speed_ratio/text_type here
        audio_cfg = {
            'voice_type': os.getenv('VOLCANO_VOICE_TYPE', 'BV503_streaming') or 'BV503_streaming',
            'encoding': os.getenv('TTS_DEFAULT_ENCODING', 'mp3'),
            'rate': int(os.getenv('TTS_DEFAULT_RATE', '24000')),
        }
        req_cfg = {
            'reqid': str(uuid.uuid4()),
            'text': text,
            'operation': 'query',
        }
        app_cfg = {
            'appid': os.getenv('TTS_APP_ID', '') or os.getenv('VOLCANO_APP_ID', ''),
            'token': os.getenv('TTS_ACCESS_TOKEN', '') or os.getenv('VOLCANO_TOKEN', ''),
            'cluster': os.getenv('VOLCANO_CLUSTER', os.getenv('TTS_CLUSTER', 'volcano_tts')),
        }
        user_cfg = {'uid': os.getenv('VOLCANO_UID', 'demo_user')}

    # Required fields and defaults
    text = (req_cfg.get('text') or text).strip()
    if not text:
        return jsonify({'error': 'text is required'}), 400
    if not app_cfg:
        app_cfg = {
            'appid': os.getenv('TTS_APP_ID', '') or os.getenv('VOLCANO_APP_ID', ''),
            'token': os.getenv('TTS_ACCESS_TOKEN', '') or os.getenv('VOLCANO_TOKEN', ''),
            'cluster': os.getenv('VOLCANO_CLUSTER', os.getenv('TTS_CLUSTER', 'volcano_tts')),
        }
    if not user_cfg:
        user_cfg = {'uid': os.getenv('VOLCANO_UID', 'demo_user')}
    if not audio_cfg:
        audio_cfg = {
            'voice_type': os.getenv('VOLCANO_VOICE_TYPE', 'BV503_streaming') or 'BV503_streaming',
            'encoding': os.getenv('TTS_DEFAULT_ENCODING', 'mp3'),
            'rate': int(os.getenv('TTS_DEFAULT_RATE', '24000')),
        }
    if not req_cfg:
        req_cfg = {
            'reqid': str(uuid.uuid4()),
            'text': text,
            'text_type': 'plain',
            'operation': 'query',
        }
    if not req_cfg.get('reqid'):
        req_cfg['reqid'] = str(uuid.uuid4())

    # Resolve core parameters
    encoding = (audio_cfg.get('encoding') or os.getenv('TTS_DEFAULT_ENCODING', 'mp3')).lower()
    voice_type = (audio_cfg.get('voice_type') or os.getenv('VOLCANO_VOICE_TYPE', 'BV503_streaming') or 'BV503_streaming').strip()
    # speed_ratio not sent upstream unless provided by vendor payload
    try:
        speed_ratio = float(audio_cfg.get('speed_ratio', 1.0) or 1.0)
    except Exception:
        speed_ratio = 1.0

    key = _cache_key(text, voice_type, encoding, speed_ratio)
    ext = 'mp3' if encoding == 'mp3' else ('wav' if encoding == 'wav' else ('ogg' if encoding in ('ogg', 'ogg_opus') else encoding))
    cache_path = _cache_path_for(key, ext)
    try:
        current_app.logger.info(f"[TTS] cache lookup key={key} path={cache_path}")
    except Exception:
        pass
    if cache_path.exists():
        try:
            now = time.time(); os.utime(cache_path, (now, now))
        except Exception:
            pass
        mime = 'audio/wav' if ext == 'wav' else ('audio/mpeg' if ext == 'mp3' else ('audio/ogg' if ext in ('ogg', 'opus', 'ogg_opus') else 'application/octet-stream'))
        return Response(cache_path.read_bytes(), mimetype=mime, headers={'Content-Disposition': f'inline; filename="speech.{ext}"'})

    volcano_url = os.getenv('VOLCANO_TTS_URL') or 'https://openspeech.bytedance.com/api/v1/tts'
    payload = {'app': app_cfg, 'user': user_cfg, 'audio': audio_cfg, 'request': req_cfg}
    access_token = (app_cfg.get('token') or os.getenv('TTS_ACCESS_TOKEN', '') or os.getenv('VOLCANO_TOKEN', '')).strip()
    if not app_cfg.get('appid') or not access_token:
        return jsonify({'error': 'missing appid or access token'}), 400
    headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer;{access_token}'}

    try:
        req = _ureq.Request(volcano_url, data=_json.dumps(payload, ensure_ascii=False).encode('utf-8'), headers=headers)
        with _ureq.urlopen(req, timeout=60) as resp:
            body = resp.read()
            try:
                parsed = _json.loads(body.decode('utf-8'))
            except Exception:
                return jsonify({'error': 'TTS returned non-JSON'}), 502
    except _uerr.HTTPError as e:
        return jsonify({'error': f'TTS HTTP error: {e.code}', 'detail': e.read().decode('utf-8', 'ignore')}), 502
    except _uerr.URLError as e:
        return jsonify({'error': f'TTS network error: {e.reason}'}), 502
    except Exception as e:
        return jsonify({'error': f'TTS call failed: {e}'}), 502

    code = parsed.get('code')
    if code != 3000:
        return jsonify({'error': 'TTS service error', 'code': code, 'message': parsed.get('message'), 'upstream': parsed}), 502

    b64 = parsed.get('data')
    if not b64:
        return jsonify({'error': 'TTS response missing audio data', 'upstream': parsed}), 502
    try:
        audio_bytes = base64.b64decode(b64)
    except Exception:
        return jsonify({'error': 'Failed to decode audio data'}), 502

    # Persist and prune cache
    tmp = cache_path.with_suffix(cache_path.suffix + '.tmp')
    try:
        tmp.write_bytes(audio_bytes)
        os.replace(tmp, cache_path)
    except Exception:
        try:
            if tmp.exists():
                tmp.unlink(missing_ok=True)  # type: ignore[arg-type]
        except Exception:
            pass
    _prune_cache_if_needed()

    mime = 'audio/wav' if ext == 'wav' else ('audio/mpeg' if ext == 'mp3' else ('audio/ogg' if ext in ('ogg', 'ogg_opus') else 'application/octet-stream'))
    return Response(audio_bytes, mimetype=mime, headers={'Content-Disposition': f'inline; filename="speech.{ext}"'})
