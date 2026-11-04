import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
it('conserva importes anteriores y fija 1400 para nuevas inscripciones',async()=>{
 const db=new PGlite();
 try {
 await db.exec('create table public.trail_teams(id int primary key,amount int not null default 1200 check(amount=1200)); insert into public.trail_teams(id) values(1);');
 await db.exec(readFileSync(new URL('../supabase/sql/update_price_350.sql',import.meta.url),'utf8'));
 await db.exec('insert into public.trail_teams(id) values(2);');
 expect((await db.query('select amount from public.trail_teams order by id')).rows).toEqual([{amount:1200},{amount:1400}]);
 await expect(db.exec('insert into public.trail_teams values(3,1)')).rejects.toThrow();
 } finally {await db.close();}
},30000);
