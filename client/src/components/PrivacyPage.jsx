import React from "react";

export default function PrivacyPage() {
  return (
    <article className="prose-page">
      <h1 className="auth-title">
        Privacy, <span className="serif">in plain words.</span>
      </h1>

      <div className="block block-lime mt-5">
        <p className="card-title">Your resume is never stored.</p>
        <p className="mt-2">
          Files are read in memory to score them and then discarded. We don't save resumes, job descriptions you paste,
          or anything the AI writes for you, not on our servers and not in our database. The only things you save are
          tracker entries you add yourself.
        </p>
      </div>

      <h2 className="section-title mt-6">What we do keep</h2>
      <ul className="prose-list">
        <li>
          <strong>Your account.</strong> Your email, and your name and profile picture if you sign in with Google. This is
          stored by our sign-in provider, Supabase.
        </li>
        <li>
          <strong>Visits.</strong> Which page was opened, an anonymous visitor ID kept in a cookie (<code>ph_vid</code>), your
          device type and browser, and an approximate country and city from your connection.
        </li>
        <li>
          <strong>Sign-ins.</strong> When you sign up or sign in, and how (Google or email link).
        </li>
        <li>
          <strong>Feature usage.</strong> That a feature was used (for example "tailored a resume" or "downloaded a PDF"),
          plus whether an AI request worked and how long it took. Never what was in it.
        </li>
        <li>
          <strong>Your tracker.</strong> Job details you add to the application tracker: title, company, location, link,
          status, your note and follow-up date. Never your resume or the job description.
        </li>
        <li>
          <strong>Feedback.</strong> If you rate an AI result: the thumbs up/down, the reason you pick and any short comment
          you type. Never the AI result itself.
        </li>
        <li>
          <strong>Errors.</strong> Which part of the site failed and the kind of error, so we can fix it.
        </li>
      </ul>

      <h2 className="section-title mt-6">Who sees it</h2>
      <p className="intro">
        Only the people who run Paperhire, through a private dashboard. We don't sell it or share it with advertisers.
        When you use an AI feature, your resume and the job description are sent to a third-party AI provider to
        generate the result; they aren't kept by us afterwards.
      </p>

      <h2 className="section-title mt-6">Cookies</h2>
      <p className="intro">
        One cookie for the anonymous visitor ID, and your sign-in session kept in your browser's storage so you stay
        signed in. No advertising or third-party tracking cookies.
      </p>

      <h2 className="section-title mt-6">Deleting your data</h2>
      <p className="intro">
        Email us from your account address and we'll delete your account. Your usage events are then no longer linked
        to you.
      </p>
    </article>
  );
}
