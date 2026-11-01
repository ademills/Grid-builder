import { Component } from 'react';
import { recordError, exportDiagnostics } from './diagnostics';
import { closeDocument } from './documentActions';
import styles from './Shell.module.css';

// Keeps a crash in one document's editor inside its tab. The document's
// state lives in the store (and its autosave), so Reload remounts the editor
// on the same data and Close goes through the usual save prompt.
export class DocumentErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    recordError(error, `editor (${this.props.docName})${info?.componentStack ? `\n${info.componentStack}` : ''}`);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={styles.docError} role="alert">
        <h2>This document hit an error</h2>
        <p>“{this.props.docName}” stopped working. Your other tabs are fine, and this document’s last changes are kept.</p>
        <pre>{error.message}</pre>
        <div className={styles.docErrorActions}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => this.setState({ error: null })}>Reload Document</button>
          <button className={styles.btn} onClick={() => closeDocument(this.props.docId)}>Close Tab</button>
          <button className={styles.btn} onClick={exportDiagnostics}>Export Diagnostics…</button>
        </div>
      </div>
    );
  }
}
