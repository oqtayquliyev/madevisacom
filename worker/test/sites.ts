// Pretend employer career sites, served locally, shaped like the real ones the worker meets.
import { createServer, type Server } from 'node:http';

export type Site = { server: Server; base: string; posts: { path: string; body: string }[] };

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:720px;margin:20px auto} label{display:block;margin-top:12px} .hidden{display:none}</style></head><body>${body}</body></html>`;

// Greenhouse's classic hosted form (boards.greenhouse.io/<board>/jobs/<id>).
const GREENHOUSE = page('Data Analyst at Hansa', `
<div id="app_body"><h1 class="app-title">Data Analyst</h1>
<form id="application_form" action="/gh/submit" method="post" enctype="multipart/form-data">
  <div class="field"><label for="first_name">First Name <span class="asterisk">*</span></label><input type="text" id="first_name" name="job_application[first_name]" aria-required="true"></div>
  <div class="field"><label for="last_name">Last Name <span class="asterisk">*</span></label><input type="text" id="last_name" name="job_application[last_name]" aria-required="true"></div>
  <div class="field"><label for="email">Email <span class="asterisk">*</span></label><input type="text" id="email" name="job_application[email]" aria-required="true"></div>
  <div class="field"><label for="phone">Phone</label><input type="text" id="phone" name="job_application[phone]"></div>
  <div class="field"><label for="resume">Resume/CV <span class="asterisk">*</span></label><input type="file" id="resume" name="resume" required></div>
  <div class="field"><label for="question_1">LinkedIn Profile</label><input type="text" id="question_1" name="question_1"></div>
  <div class="field"><label for="question_2">Will you now or in the future require sponsorship for employment visa status? <span class="asterisk">*</span></label>
    <select id="question_2" name="question_2" required><option value="">--</option><option value="1">Yes</option><option value="0">No</option></select></div>
  <div class="field"><label for="question_4">What are your salary expectations? <span class="asterisk">*</span></label><input type="text" id="question_4" name="question_4" required></div>
  <div class="field"><label for="gender">Gender</label><select id="gender" name="gender"><option value="">Please select</option><option>Male</option><option>Female</option><option>Decline To Self Identify</option></select></div>
  <div class="field"><label><input type="checkbox" name="gdpr" required> I consent to the processing of my personal data in line with the Candidate Privacy Notice *</label></div>
  <div class="field"><label><input type="checkbox" name="talent_pool"> Keep my data for future roles (optional consent)</label></div>
  <input type="submit" id="submit_app" value="Submit Application">
</form></div>
<iframe src="https://www.google.com/recaptcha/api2/anchor?k=x&size=invisible" style="width:256px;height:60px;position:fixed;bottom:0;right:0"></iframe>`);

// Lever (jobs.lever.co/<site>/<id>/apply): standard fields + a question card.
const LEVER = page('Hansa - Data Analyst', `
<form id="application-form" action="/lever/submit" method="post" enctype="multipart/form-data">
  <div class="application-question"><div class="application-label">Resume/CV<span class="required">✱</span></div><input type="file" name="resume" required style="opacity:0;position:absolute"></div>
  <ul>
  <li class="application-question"><div class="application-label">Full name<span class="required">✱</span></div><div class="application-field"><input type="text" name="name" required></div></li>
  <li class="application-question"><div class="application-label">Email<span class="required">✱</span></div><div class="application-field"><input type="email" name="email" required></div></li>
  <li class="application-question"><div class="application-label">Phone</div><div class="application-field"><input type="text" name="phone"></div></li>
  <li class="application-question"><div class="application-label">Current location</div><div class="application-field"><input type="text" name="location"></div></li>
  <li class="application-question"><div class="application-label">LinkedIn URL</div><div class="application-field"><input type="text" name="urls[LinkedIn]"></div></li>
  </ul>
  <div class="application-question custom-question">
    <div class="application-label"><div class="text">Will you require visa sponsorship to work in Germany?<span class="required">✱</span></div></div>
    <div class="application-field"><ul>
      <li><label><input type="radio" name="cards[c1][field0]" value="Yes" required>Yes</label></li>
      <li><label><input type="radio" name="cards[c1][field0]" value="No">No</label></li>
    </ul></div>
  </div>
  <div class="application-question custom-question">
    <div class="application-label"><div class="text">Why do you want to join Hansa?<span class="required">✱</span></div></div>
    <div class="application-field"><textarea name="cards[c1][field1]" required></textarea></div>
  </div>
  <button type="submit" class="postings-btn template-btn-submit">Submit application</button>
</form>`);

// A company's own careers page: a job ad with an "Apply now" button that opens the form.
const GENERIC_AD = page('Careers — Data Analyst', `<h1>Data Analyst</h1><p>Join our team in Berlin.</p><a href="/acme/apply">Apply now</a>`);
const GENERIC_FORM = page('Apply — Data Analyst', `
<form action="/acme/submit" method="post" enctype="multipart/form-data">
  <fieldset><legend>Personal details</legend>
  <label>First name * <input name="fname" required></label>
  <label>Last name * <input name="lname" required></label>
  <label>E-mail address * <input type="email" name="mail" required></label>
  <label>Mobile phone <input type="tel" name="tel"></label>
  <label id="cc-l" for="cc">Country *</label>
  <div class="combo" role="combobox" aria-expanded="false" aria-labelledby="cc-l"><input id="cc" aria-required="true" autocomplete="off"><input type="hidden" name="country" required></div>
  <div role="listbox" id="cc-list" hidden></div>
  <script>
  (function(){
    // Like Greenhouse's phone-country picker: options carry the dialling code ("Azerbaijan +994").
    var all=['Austria +43','Azerbaijan +994','Germany +49','United Kingdom +44'];
    var box=document.getElementById('cc'), list=document.getElementById('cc-list'), hid=document.querySelector('input[name=country]');
    function show(){ var q=box.value.toLowerCase(); list.innerHTML=''; all.filter(function(o){return o.toLowerCase().indexOf(q)>=0}).forEach(function(o){
      var d=document.createElement('div'); d.setAttribute('role','option'); d.textContent=o; d.onclick=function(){ box.value=o; hid.value=o.split(' +')[0]; list.hidden=true; }; list.appendChild(d); }); list.hidden=false; }
    box.addEventListener('focus', show); box.addEventListener('input', show);
  })();
  </script>
  </fieldset>
  <fieldset><legend>Are you legally authorized to work in Germany? *</legend>
    <label><input type="radio" name="auth" value="y" required> Yes</label>
    <label><input type="radio" name="auth" value="n"> No</label>
  </fieldset>
  <label>How many years of experience do you have? *
    <select name="years" required><option value="">Choose…</option><option>0-2 years</option><option>3-5 years</option><option>6-9 years</option><option>10+ years</option></select></label>
  <label>How did you hear about us? <select name="src"><option value="">Select</option><option>LinkedIn</option><option>Job board</option><option>Friend</option></select></label>
  <label>Upload your CV * <input type="file" name="cv" required></label>
  <label><input type="checkbox" name="privacy" required> I have read and agree to the privacy policy *</label>
  <button type="submit">Send application</button>
</form>`);

const THANKS = page('Thank you', `<h1>Thank you for applying!</h1><p>We have received your application. Your application ID: HX-48213.</p>`);

export function startSites(port = 0): Promise<Site> {
  const posts: Site['posts'] = [];
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const send = (status: number, html: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
      res.end(html);
    };
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('latin1');
        posts.push({ path, body });
        if (path === '/refuse/submit') return send(200, page('Apply', `<form action="/refuse/submit" method="post"><label for="p">Phone *</label><input id="p" name="phone" aria-invalid="true" required><p class="error">Phone is required</p><button type="submit">Submit</button></form>`));
        if (path === '/silent/submit') return send(200, page('Apply', '<p>OK</p>'));
        if (path === '/gh/submit') return send(302, '', { Location: '/gh/confirmation' });
        return send(200, THANKS);
      });
      return;
    }
    if (path === '/gh/jobs/1001') return send(200, GREENHOUSE);
    if (path === '/gh/confirmation') return send(200, THANKS);
    if (path === '/lever/c1/apply' || path === '/lever/0b1d2c3e-1111-4111-8111-111111111111/apply') return send(200, LEVER);
    if (path === '/acme/jobs/7') return send(200, GENERIC_AD);
    if (path === '/acme/apply') return send(200, GENERIC_FORM);
    if (path === '/captcha') return send(200, GENERIC_FORM.replace('</form>', '<div class="g-recaptcha"><iframe src="/recaptcha/api2/anchor?k=x" style="width:304px;height:78px"></iframe></div></form>'));
    if (path === '/recaptcha/api2/anchor') return send(200, page('captcha', '<div>I am not a robot</div>'));
    if (path === '/login') return send(200, page('Sign in', `<h1>Sign in to apply</h1><form><label>Email <input name="u"></label><label>Password <input type="password" name="p"></label><button>Sign in</button></form>`));
    if (path === '/refuse') return send(200, GENERIC_FORM.replace('action="/acme/submit"', 'action="/refuse/submit"'));
    if (path === '/silent') return send(200, GENERIC_FORM.replace('action="/acme/submit"', 'action="/silent/submit"'));
    if (path === '/closed') return send(200, page('Job', '<h1>Sorry, this job is no longer available.</h1>'));
    return send(404, page('Not found', '<h1>Page not found</h1>'));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const a = server.address();
    resolve({ server, base: `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`, posts });
  }));
}
