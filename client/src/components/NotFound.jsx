import React from "react";
import { linkProps } from "../lib/router.js";

export default function NotFound() {
  return (
    <section className="prose-page">
      <p className="notfound-code">404</p>
      <h1 className="auth-title">
        This page <span className="serif">isn't here.</span>
      </h1>
      <p className="hero-sub">It may have moved, or you may not have access to it.</p>
      <a className="btn btn-primary mt-4" {...linkProps("/")}>
        Back to Paperhire
      </a>
    </section>
  );
}
