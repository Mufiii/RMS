# Malayalam glossary: for the shop owner to confirm

The app uses one Malayalam word for each idea, everywhere (screens and printed slips). Please tick each word that is right, or write the word your customers and staff actually say. One change here updates the whole app.

Status: **awaiting the owner's confirmation** (prepared 2026-11-07, Step 9).

## Printed on slips (customers see these)

| English | Malayalam used | OK? / Better word |
|---|---|---|
| Invoice | ഇൻവോയ്സ് | |
| Statement | സ്റ്റേറ്റ്മെന്റ് | |
| Receipt | രസീത് | |
| Refund voucher | റീഫണ്ട് വൗച്ചർ | |
| Rent | വാടക | |
| Days | ദിവസം | |
| Damage / loss | കേടുപാട് / നഷ്ടം | |
| Discount | കിഴിവ് | |
| Total | ആകെ | |
| Received | ലഭിച്ചത് | |
| Balance | ബാക്കി | |
| Issued (date out) | നൽകിയത് | |
| Returned | തിരികെ | |
| Still out | ഇപ്പോഴും പുറത്ത് | |
| Thank you | നന്ദി | |
| Cash / UPI / Bank transfer / Cheque | പണം / യുപിഐ / ബാങ്ക് ട്രാൻസ്ഫർ / ചെക്ക് | |

## Used on screens

| English | Malayalam used | Note | OK? / Better word |
|---|---|---|---|
| Product (in the catalogue) | ഉൽപ്പന്നം | "Generator 5 kVA" as a thing the shop rents out | |
| Item (a piece out on rent) | സാധനം | "3 items still out" | |
| Customer | ഉപഭോക്താവ് | | |
| Order | ഓർഡർ | | |
| Return (bringing items back) | തിരികെ വരവ് | | |
| Good / Damaged / Lost | നല്ലത് / കേടായത് / നഷ്ടപ്പെട്ടത് | condition on return | |
| Advance | അഡ്വാൻസ് | money before the final invoice | |
| Payment | പേയ്മെന്റ് | | |
| Refund | റീഫണ്ട് (noun), തിരികെ നൽകുക (to refund) | | |
| Void (correct a wrong entry) | അസാധുവാക്കുക | admin fixes a mistake; record kept | |
| Cancel (an order / invoice) | റദ്ദാക്കുക | | |
| Stock | സ്റ്റോക്ക് | | |
| Available | ലഭ്യം | | |
| In repair | റിപ്പയറിൽ | | |
| Long rental | ദീർഘ വാടക | out 30+ days | |
| Settings | സെറ്റിംഗ്സ് | | |
| Save | സേവ് ചെയ്യുക | | |

## How this was checked

- Every screen and printed label has a Malayalam text: 751 of 751. An automated test fails the build if any is missing, empty or still in English.
- The words above are used consistently. A scan found five "product" texts using സാധനം instead of ഉൽപ്പന്നം; they were corrected.
- The only Latin text left is intentional: the "English" option in the language switch, product codes like GEN-5KVA, and file types (PNG, JPEG, CSV).
