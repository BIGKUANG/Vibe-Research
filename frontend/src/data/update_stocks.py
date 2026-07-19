import os
import tushare as ts

pro = ts.pro_api('0509f9bfc3a980393e1006cebb70105bae18f3afc7efb61531373331')
pro._DataApi__http_url = "https://tt.xiaodefa.cn"

df = pro.query('stock_basic', exchange='', list_status='L', fields='ts_code,symbol,name,area,industry,list_date')

def get_market(ts_code):
    board = ts_code.split('.')[-1]
    code = ts_code.split('.')[0]
    if board == 'SH':
        if code.startswith('688'):
            return '科创板'
        return '主板'
    elif board == 'SZ':
        if code.startswith('300') or code.startswith('301'):
            return '创业板'
        if code.startswith('002'):
            return '中小板'
        return '主板'
    elif board == 'BJ':
        return '北交所'
    return '主板'

rows = []
for _, r in df.iterrows():
    code = r['symbol']
    market = get_market(r['ts_code'])
    rows.append(f"{code},{r['name']},{r['industry']},{r['area']},{market},{r['list_date']}")

hk_df = pro.query('hk_basic', list_status='L')
for _, r in hk_df.iterrows():
    code = r['ts_code'].split('.')[0]
    name = r['name'].replace(',', ' ') if ',' in str(r['name']) else r['name']
    rows.append(f"{code},{name},,,港股,{r['list_date']}")

rows.sort(key=lambda x: x.split(',')[0])

out = os.path.join(os.path.dirname(__file__), 'stock_codes.csv')
with open(out, 'w', encoding='utf-8') as f:
    f.write("code,name,industry,area,market,list_date\n")
    f.write("\n".join(rows) + "\n")

print(f"Done. {len(rows)} stocks written to {out}")
