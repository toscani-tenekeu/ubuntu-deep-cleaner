import { css } from 'lit';

export const appStyles = css`
  :host {
    --header-height: 3rem;
    --nav-width: 11.5rem;
    display: block;
    min-height: 100vh;
    color: #161616;
    background: #f4f4f4;
  }

  .topbar {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 9000;
    height: var(--header-height);
    display: flex;
    align-items: center;
    background: #161616;
    color: #f4f4f4;
    border-bottom: 1px solid #393939;
  }

  .menu-toggle {
    width: 3rem;
    height: 3rem;
    border: 0;
    background: transparent;
    color: #f4f4f4;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
  }

  .brand { padding: 0 1rem; font-size: 0.875rem; font-weight: 600; letter-spacing: 0.1px; }
  .connection { margin-left: auto; padding: 0 1rem; display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
  .connection-dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #42be65; }
  .connection-dot.offline { background: #fa4d56; }

  .side-nav {
    position: fixed;
    z-index: 8000;
    top: var(--header-height);
    bottom: 0;
    left: 0;
    width: var(--nav-width);
    display: flex;
    flex-direction: column;
    background: #161616;
    color: #c6c6c6;
  }

  .nav-list { list-style: none; margin: 1rem 0 0; padding: 0; }
  .nav-spacer { flex: 1; }
  .nav-link {
    width: 100%;
    min-height: 3rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 1rem;
    border: 0;
    border-left: 0.25rem solid transparent;
    background: transparent;
    color: #c6c6c6;
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
  }
  .nav-link:hover { background: #262626; color: #fff; }
  .nav-link:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
  .nav-link.active { background: #393939; border-left-color: #0f62fe; color: #fff; }
  .nav-icon { width: 1rem; height: 1rem; flex: none; fill: currentColor; }

  main {
    margin-left: var(--nav-width);
    padding-top: var(--header-height);
    min-height: 100vh;
    background: #f4f4f4;
  }

  .content { padding: 1.5rem; max-width: 100rem; margin: 0 auto; }
  .page-header { display: flex; align-items: flex-start; gap: 2rem; margin-bottom: 1rem; }
  .page-heading { flex: 1; }
  h1 { margin: 0 0 0.625rem; font-size: clamp(2rem, 3vw, 2.625rem); line-height: 1.12; font-weight: 400; }
  h2 { margin: 0; font-size: 1.25rem; line-height: 1.4; font-weight: 400; }
  h3 { margin: 0; font-size: 1rem; line-height: 1.4; font-weight: 600; }
  p { margin: 0; }
  .lede { max-width: 42rem; color: #525252; font-size: 0.875rem; line-height: 1.5; }

  .scan-progress {
    background: #fff;
    border: 1px solid #c6c6c6;
    display: grid;
    grid-template-columns: minmax(12rem, 18rem) 1fr auto;
    align-items: center;
    gap: 1.5rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .scan-stage { font-weight: 600; font-size: 0.875rem; }
  .scan-helper { color: #525252; font-size: 0.875rem; margin-top: 0.25rem; }

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: #c6c6c6;
    border: 1px solid #c6c6c6;
    margin-bottom: 1rem;
  }

  .metric {
    min-height: 9.75rem;
    padding: 1.25rem;
    background: #fff;
  }
  .metric-label { font-size: 0.875rem; font-weight: 600; margin-bottom: 1rem; }
  .metric-value { font-size: 1.75rem; line-height: 1.2; font-weight: 400; margin-bottom: 1rem; }
  .metric-helper { color: #525252; font-size: 0.875rem; line-height: 1.45; }
  .disk-track { height: 0.5rem; background: #e0e0e0; margin: 0.25rem 0 0.75rem; }
  .disk-fill { height: 100%; background: #0f62fe; transition: width 240ms ease; }

  .notification-row { margin-bottom: 1rem; }
  .workspace { display: grid; grid-template-columns: minmax(0, 1fr) 16rem; align-items: stretch; }
  .findings { min-width: 0; background: #fff; border: 1px solid #c6c6c6; }
  .findings-heading { padding: 1rem 1rem 0; }
  .toolbar { display: grid; grid-template-columns: minmax(12rem, 1fr) 10rem 11rem auto; align-items: end; gap: 0.75rem; padding: 1rem; }
  .native-filter { display: flex; flex-direction: column; gap: 0.35rem; }
  .native-filter label { font-size: 0.75rem; color: #525252; }
  .native-filter select { height: 2.5rem; border: 0; border-bottom: 1px solid #8d8d8d; background: #f4f4f4; padding: 0 2rem 0 0.75rem; color: #161616; }
  .result-count { align-self: center; justify-self: end; font-size: 0.875rem; color: #525252; }

  .table-scroll { overflow: auto; border-top: 1px solid #e0e0e0; }
  table { width: 100%; min-width: 52rem; border-collapse: collapse; font-size: 0.875rem; }
  th { height: 2.5rem; background: #e0e0e0; text-align: left; font-weight: 600; padding: 0 0.75rem; border-bottom: 1px solid #8d8d8d; }
  td { height: 3rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid #e0e0e0; vertical-align: middle; }
  tr:hover td { background: #f4f4f4; }
  .checkbox-cell { width: 2.5rem; text-align: center; padding: 0 0.5rem; }
  .item-title { font-weight: 500; }
  .item-evidence { color: #6f6f6f; font-size: 0.75rem; margin-top: 0.2rem; max-width: 32rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .risk { display: inline-flex; padding: 0.125rem 0.5rem; font-size: 0.75rem; }
  .risk-low { background: #a7f0ba; color: #044317; }
  .risk-medium { background: #fddc69; color: #684e00; }
  .risk-high { background: #ffd7d9; color: #750e13; }
  .status { display: inline-flex; padding: 0.125rem 0.5rem; background: #d0e2ff; color: #002d9c; font-size: 0.75rem; }

  .plan {
    padding: 1.25rem;
    background: #fff;
    border: 1px solid #c6c6c6;
    border-left: 0;
  }
  .plan-block { padding: 1.25rem 0; border-bottom: 1px solid #c6c6c6; }
  .plan-label { color: #525252; font-size: 0.875rem; margin-bottom: 0.5rem; }
  .plan-value { font-size: 1.75rem; line-height: 1.2; }
  .plan-helper { color: #525252; font-size: 0.75rem; line-height: 1.45; margin-top: 0.5rem; }
  .plan-action { margin-top: 1.25rem; }

  .empty-state { min-height: 20rem; display: grid; place-content: center; text-align: center; background: #fff; border: 1px solid #c6c6c6; padding: 2rem; }
  .empty-state h2 { margin-bottom: 0.5rem; }
  .empty-state p { color: #525252; max-width: 32rem; line-height: 1.5; }
  .secondary-page { display: grid; gap: 1rem; }
  .history-list { background: #fff; border: 1px solid #c6c6c6; }
  .history-row { display: grid; grid-template-columns: 8rem 1fr 8rem 12rem; gap: 1rem; padding: 1rem; border-bottom: 1px solid #e0e0e0; font-size: 0.875rem; }

  .modal-copy { line-height: 1.5; color: #393939; margin-bottom: 1rem; }
  .modal-summary { background: #f4f4f4; padding: 1rem; margin-bottom: 1rem; }
  .modal-summary strong { display: block; font-size: 1.25rem; margin-top: 0.25rem; }
  .confirmation-help { font-size: 0.75rem; color: #525252; margin: 0.75rem 0 0.5rem; }

  .skeleton-line { height: 0.875rem; width: 75%; background: linear-gradient(90deg, #e0e0e0 20%, #f4f4f4 50%, #e0e0e0 80%); background-size: 200% 100%; animation: skeleton 1.4s infinite; }
  @keyframes skeleton { to { background-position: -200% 0; } }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }

  @media (max-width: 1000px) {
    .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .workspace { grid-template-columns: 1fr; }
    .plan { border-left: 1px solid #c6c6c6; border-top: 0; }
    .toolbar { grid-template-columns: 1fr 1fr; }
  }

  @media (max-width: 700px) {
    :host { --nav-width: 0rem; }
    .menu-toggle { display: flex; }
    .side-nav { width: 16rem; transform: translateX(-100%); transition: transform 180ms ease; }
    .side-nav.open { transform: translateX(0); }
    .content { padding: 1rem; }
    .page-header { flex-direction: column; gap: 1rem; }
    .scan-progress { grid-template-columns: 1fr; gap: 0.75rem; }
    .metrics { grid-template-columns: 1fr; }
    .toolbar { grid-template-columns: 1fr; }
    .result-count { justify-self: start; }
    .history-row { grid-template-columns: 1fr 1fr; }
  }
`;
