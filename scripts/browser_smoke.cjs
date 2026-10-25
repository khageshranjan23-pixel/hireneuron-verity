/* Requires: npm install --no-save playwright (in a separate QA environment).
   Start API+web first; set TEST_RECRUITER_TOKEN, BASE_URL (default localhost:3000).
   Creates an explicitly labeled QA session; never use its answers as benchmark data. */
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{
const p=await browser.newPage();await p.goto(process.env.BASE_URL||'http://localhost:3000');
await p.getByLabel('Recruiter token').fill(process.env.TEST_RECRUITER_TOKEN);await p.getByRole('button',{name:'Open workspace'}).click();
await p.getByRole('button',{name:'Create interview',exact:true}).first().click();await p.getByLabel('candidate name',{exact:true}).fill('Browser QA fixture');await p.getByLabel('question count',{exact:true}).fill('2');await p.getByRole('button',{name:'Create blueprint'}).click();
await p.getByRole('heading',{name:'Browser QA fixture'}).waitFor();const link=await p.locator('input[readonly]').first().inputValue();const c=await browser.newPage();await c.goto(link);await c.getByRole('checkbox').check();await c.getByRole('button',{name:'Begin interview'}).click();
await c.getByRole('textbox').first().fill('This is a labeled software test answer, not a real interview result.');await c.getByRole('button',{name:'Done answering'}).click();await c.getByText('QUESTION 2 / 2',{exact:true}).waitFor();await c.getByRole('button',{name:'Skip',exact:true}).click();await c.getByRole('button',{name:'Yes, skip'}).click();await c.getByRole('heading',{name:'Thank you. Your interview is complete.'}).waitFor();
await p.getByRole('button',{name:'Refresh',exact:true}).click();await p.getByText('This is a labeled software test answer, not a real interview result.',{exact:false}).waitFor();console.log('Text lifecycle PASS');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
