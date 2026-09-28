package main

import (
	"html/template"
	"os"
	"path/filepath"

	"github.com/BeyndtechArc/Seametry/server/internal/receipt"
)

// distinctGrades lists each grade once, in the order first met.
//
// It does not sort or pick a "weakest". BRAND_AND_WORLD.md section 4 says a
// grade describes the legal shape of a claim and nothing about quality, and no
// document defines an order between grades, so any order chosen here would be
// an invention presented as a fact.
func distinctGrades(cs []receipt.Constituent) []string {
	seen := map[string]bool{}
	var out []string
	for _, c := range cs {
		if !seen[c.Grade] {
			seen[c.Grade] = true
			out = append(out, c.Grade)
		}
	}
	return out
}

// writeHallmarkPages writes one page per receipt at its serial
// (EXPLORER.md section 3.5) and returns how many it wrote.
//
// The filenames are flat, hallmark-<serial>.html rather than
// hallmark/<serial>.html, so every relative asset path the other pages use
// keeps working unchanged. Cloudflare Pages serves the matching file for the
// extension-less path (see host.go), so each is reachable at
// /hallmark-<serial>.
func writeHallmarkPages(out string, tmpl *template.Template, base page, proofs []receipt.Proof) int {
	for i := range proofs {
		data := base
		data.Title = "Hallmark " + string(proofs[i].Serial)
		// No nav item is "hallmark"; marking verify as current would claim the
		// visitor is on a page they are not.
		data.Nav = ""
		data.Proof = &proofs[i]

		file, err := os.Create(filepath.Join(out, "hallmark-"+string(proofs[i].Serial)+".html"))
		if err != nil {
			fail(err)
		}
		if err := tmpl.ExecuteTemplate(file, "hallmark.html", data); err != nil {
			fail(err)
		}
		file.Close()
	}
	return len(proofs)
}
