package main

import (
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/casbin/casbin/v2"
	"github.com/casbin/casbin/v2/model"
	"gopkg.in/yaml.v3"
)

/* ==========
   YAML MODEL
   ========== */

type Relationship struct {
	Name         string   `yaml:"name"`          // e.g., "management_group"
	RelationWith string   `yaml:"relation_with"` // e.g., "group" or "project"
	Column       string   `yaml:"column"`        // e.g., "management_group_id" or "audit_group_id"
	ColumnType   string   `yaml:"column_type"`   // "varchar" | "array"
	Actions      []string `yaml:"actions"`       // allowed actions for this relationship on THIS entity
}

type Entity struct {
	Name          string         `yaml:"name"`
	Description   string         `yaml:"description"`
	Table         string         `yaml:"table"`
	ColumnID      string         `yaml:"column_id"`
	Relationships []Relationship `yaml:"relationships"`
}

type Permissions struct {
	Defaults struct {
		AllowEffect string `yaml:"allow_effect"`
		DenyEffect  string `yaml:"deny_effect"`
	} `yaml:"defaults"`
}

type Config struct {
	Entities    []Entity    `yaml:"entities"`
	Permissions Permissions `yaml:"permissions"`
}

/* ==========
   HELPERS
   ========== */

func mustReadFile(path string) []byte {
	b, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("read %s: %v", path, err)
	}
	return b
}

func mustLoadYAML[T any](path string, out *T) {
	if err := yaml.Unmarshal(mustReadFile(path), out); err != nil {
		log.Fatalf("yaml %s: %v", path, err)
	}
}

func findEntity(cfg *Config, name string) *Entity {
	for i := range cfg.Entities {
		if cfg.Entities[i].Name == name {
			return &cfg.Entities[i]
		}
	}
	return nil
}

// object like "project:alpha" -> ("project","alpha", true)
func splitObject(obj string) (typ, id string, ok bool) {
	parts := strings.SplitN(obj, ":", 2)
	if len(parts) != 2 {
		return "", "", false
	}
	return parts[0], parts[1], true
}

/* ============================
   DYNAMIC CASBIN MODEL (single g)
   ============================ */

func buildDynamicModel() model.Model {
	// Single graph: g(sub, obj, rel)
	// Policies express which relationship (rel) allows which actions for which object type.
	modelStr := `
[request_definition]
r = sub, obj, act

[policy_definition]
p = rel, obj_type, act, eft

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub, r.obj, p.rel) && (r.act == p.act || p.act == "*")
`
	m, err := model.NewModelFromString(modelStr)
	if err != nil {
		log.Fatalf("build model: %v", err)
	}
	return m
}

/* ==========================================
   LOAD POLICIES FROM YAML RELATIONSHIP ACTIONS
   ========================================== */

func loadPoliciesFromYAML(e *casbin.Enforcer, cfg *Config) {
	allow := cfg.Permissions.Defaults.AllowEffect
	if allow == "" {
		allow = "allow"
	}

	// For each entity, for each relationship on that entity,
	// generate "p, <relName>, <entityName>, <action>, allow"
	for _, ent := range cfg.Entities {
		for _, rel := range ent.Relationships {
			if len(rel.Actions) == 0 {
				continue
			}
			for _, act := range rel.Actions {
				_, _ = e.AddPolicy(rel.Name, ent.Name, act, allow)
			}
		}
	}
}

/* ==========================================
   LOAD GROUPING (g) BINDINGS FROM CSV
   ========================================== */

type Binding struct {
	User string // e.g., "user:alice"
	Obj  string // e.g., "project:alpha"
	Rel  string // e.g., "management_group" | "audit_group" | "belongs_to_project"
}

// bindings.csv rows: user,object,relationship
func loadBindingsCSV(path string) ([]Binding, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1

	rows, err := r.ReadAll()
	if err != nil {
		return nil, err
	}
	var out []Binding
	for idx, row := range rows {
		if len(row) < 3 {
			log.Printf("bindings.csv: skipping row %d (need user,obj,rel)", idx+1)
			continue
		}
		out = append(out, Binding{
			User: strings.TrimSpace(row[0]),
			Obj:  strings.TrimSpace(row[1]),
			Rel:  strings.TrimSpace(row[2]),
		})
	}
	return out, nil
}

func applyBindings(e *casbin.Enforcer, bindings []Binding) {
	for _, b := range bindings {
		// g, user, object, rel
		_, _ = e.AddNamedGroupingPolicy("g", b.User, b.Obj, b.Rel)
	}
}

/* ==========================================
   OPTIONAL: LOAD USER→GROUP MEMBERSHIPS (for SQL filters)
   ========================================== */

func loadUserGroupsCSV(path string) map[string][]string {
	f, err := os.Open(path)
	if err != nil {
		// optional file; no problem if absent
		return map[string][]string{}
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		log.Printf("read user_groups.csv: %v", err)
		return map[string][]string{}
	}
	m := map[string][]string{}
	for idx, row := range rows {
		if len(row) < 2 {
			log.Printf("user_groups.csv: skipping row %d (need user,group)", idx+1)
			continue
		}
		user := strings.TrimSpace(row[0])
		grp := strings.TrimSpace(row[1])
		m[user] = append(m[user], grp)
	}
	return m
}

/* ==========================================
   SQL FILTER BUILDER
   ========================================== */

// Build a *general* SQL WHERE for an entity table, reflecting rows the user can see,
// based on (a) direct bindings to objects of that entity, and
// (b) group-based relationships defined in YAML plus user→group memberships (if provided).
func BuildSQLFilter(cfg *Config, e *casbin.Enforcer, user string, entityName string, userGroups map[string][]string) string {
	ent := findEntity(cfg, entityName)
	if ent == nil {
		return "1=0"
	}

	// 1) Collect direct object ids for this entity from g(user, obj, rel) links
	//    i.e., user is linked directly to "entity:id"
	var ids []string
	// Get all group policies and scan for g(user, entity:ID, anyRel)
	// Note: casbin doesn't expose 3-arity in a single call; but we can iterate its adapter state via e.GetModel() or Keep a copy.
	// Simpler: we ask Casbin's API for roles of 'user' (returns objs), then filter by prefix.
	roleObjs, _ := e.GetRolesForUser(user) // returns objs (2nd arg in g)
	for _, obj := range roleObjs {
		t, id, ok := splitObject(obj)
		if !ok {
			continue
		}
		if t == entityName {
			ids = append(ids, id)
		}
	}

	conds := []string{}

	// id IN (...)
	if len(ids) > 0 {
		quoted := make([]string, 0, len(ids))
		for _, v := range ids {
			quoted = append(quoted, fmt.Sprintf("'%s'", v))
		}
		conds = append(conds, fmt.Sprintf("%s IN (%s)", ent.ColumnID, strings.Join(quoted, ", ")))
	}

	// 2) Group-based columns (relation_with == "group")
	groups := userGroups[user]
	if len(groups) > 0 {
		for _, rel := range ent.Relationships {
			if rel.RelationWith != "group" || rel.Column == "" {
				continue
			}
			switch strings.ToLower(rel.ColumnType) {
			case "array":
				// Postgres example: column && ARRAY['g1','g2']
				quoted := make([]string, 0, len(groups))
				for _, g := range groups {
					quoted = append(quoted, fmt.Sprintf("'%s'", g))
				}
				conds = append(conds, fmt.Sprintf("%s && ARRAY[%s]", rel.Column, strings.Join(quoted, ", ")))
			default:
				// equality against any group (IN)
				quoted := make([]string, 0, len(groups))
				for _, g := range groups {
					quoted = append(quoted, fmt.Sprintf("'%s'", g))
				}
				conds = append(conds, fmt.Sprintf("%s IN (%s)", rel.Column, strings.Join(quoted, ", ")))
			}
		}
	}

	if len(conds) == 0 {
		return "1=0"
	}
	return strings.Join(conds, " OR ")
}

/* =========================
   MAIN
   ========================= */

func main() {
	// --- Load YAML model (your new schema) ---
	var cfg Config
	mustLoadYAML("access_model.yaml", &cfg)

	// --- Build dynamic model & enforcer ---
	m := buildDynamicModel()
	e, err := casbin.NewEnforcer(m)
	if err != nil {
		log.Fatalf("enforcer: %v", err)
	}

	// --- Policies derived from YAML relationships/actions ---
	loadPoliciesFromYAML(e, &cfg)

	// --- Load bindings (g triples) ---
	// Expect "bindings.csv" in CWD (user,obj,rel)
	if _, err := os.Stat("bindings.csv"); err == nil {
		bindings, err := loadBindingsCSV("bindings.csv")
		if err != nil {
			log.Fatalf("bindings.csv: %v", err)
		}
		applyBindings(e, bindings)
		ExpandIndirectRelationships(e)
		if err := e.BuildRoleLinks(); err != nil {
			log.Fatalf("BuildRoleLinks: %v", err)
		}
	} else {
		fmt.Println("note: bindings.csv not found — you can add user,obj,rel triples there")
	}

	// --- Optional: user→group memberships for SQL filter generation ---
	userGroups := map[string][]string{}
	if _, err := os.Stat("user_groups.csv"); err == nil {
		userGroups = loadUserGroupsCSV("user_groups.csv")
	}

	// --- Build links and role graph ---
	if err := e.BuildRoleLinks(); err != nil {
		log.Fatalf("BuildRoleLinks: %v", err)
	}

	// --- Show current g rules ---
	fmt.Println("=== Grouping rules (g) ===")
	rels := map[string][][]string{}
	r, err := e.GetNamedGroupingPolicy("g")
	if err != nil {
		log.Fatalf("GetNamedGroupingPolicy: %v", err)
	}
	for _, rule := range r {
		if len(rule) == 3 {
			rels[rule[2]] = append(rels[rule[2]], rule)
		}
	}
	for rel, list := range rels {
		fmt.Printf("\n[%s]\n", rel)
		for _, r := range list {
			fmt.Printf("  %s -> %s\n", r[0], r[1])
		}
	}
	fmt.Println()

	// --- Test cases ---
	tests := []struct {
		user   string
		object string
		action string
	}{
		{"dms:caf-dms", "device:caf-01", "read"},
		{"dms:caf-dms", "device:caf-02", "write"},
		{"device:caf-01", "certificate:caf-01-001", "read"},
		{"dms:caf-dms", "certificate:caf-01-001", "read"},
		{"user:bob", "device:lks-01", "delete"},
	}

	fmt.Println("=== Access Control Tests ===")
	for _, tc := range tests {
		ok, err := e.Enforce(tc.user, tc.object, tc.action)
		if err != nil {
			fmt.Printf("→ %s wants to %s %s\n", tc.user, tc.action, tc.object)
			fmt.Printf("   error: %v\n", err)
			continue
		}
		fmt.Printf("→ %s wants to %s %s\n", tc.user, tc.action, tc.object)
		if ok {
			fmt.Printf("   ✅ ACCESS GRANTED\n")

			// On grant: print SQL filter for the *entity* of the object
			typ, _, _ := splitObject(tc.object)
			ent := findEntity(&cfg, typ)
			if ent == nil {
				fmt.Println("   (no entity metadata; cannot build SQL filter)")
				continue
			}

			PrintAccessChain(e, tc.user, tc.object)

			sql := BuildSQLFilter(&cfg, e, tc.user, ent.Name, userGroups)
			fmt.Printf("   SQL Filter for table %s:\n     %s\n", ent.Table, sql)
		} else {
			fmt.Printf("   ❌ ACCESS DENIED\n")
		}
	}
}

/* =========================
   Small helpers for printing
   ========================= */

func listAllUsersFromBindings(path string) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	r := csv.NewReader(f)
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	var out []string
	for _, row := range rows {
		if len(row) < 3 {
			continue
		}
		u := strings.TrimSpace(row[0])
		if !seen[u] {
			seen[u] = true
			out = append(out, u)
		}
	}
	return out
}

// ExpandIndirectRelationships builds transitive "g" links, e.g.:
// if (dms → device) and (device → certificate),
// then add (dms → certificate)
func ExpandIndirectRelationships(e *casbin.Enforcer) {
	_, err := e.GetNamedGroupingPolicy("g")
	if err != nil {
		log.Printf("failed to get grouping policy: %v", err)
		return
	}
	added := true

	for added {
		added = false
		current, err := e.GetNamedGroupingPolicy("g")
		if err != nil {
			log.Printf("failed to get grouping policy: %v", err)
			return
		}

		for _, a := range current {
			if len(a) < 3 {
				continue
			}
			subA, objA, relA := a[0], a[1], a[2]

			// Look for objA being subject of another relation
			for _, b := range current {
				if len(b) < 3 {
					continue
				}
				subB, objB, relB := b[0], b[1], b[2]
				if subB == objA {
					// Create indirect link: subA -> objB
					ok, _ := e.AddNamedGroupingPolicy("g", subA, objB, relB)
					if ok {
						fmt.Printf("  [expanded] %s → %s via (%s→%s)\n", subA, objB, relA, relB)
						added = true
					}
				}
			}
		}
	}
}

// PrintAccessChain shows the relationship chain from subject to object if reachable.
func PrintAccessChain(e *casbin.Enforcer, sub, obj string) {
	rules, _ := e.GetNamedGroupingPolicy("g")

	// Build adjacency list
	graph := map[string][]string{}
	for _, rule := range rules {
		if len(rule) < 2 {
			continue
		}
		graph[rule[0]] = append(graph[rule[0]], rule[1])
	}

	// Find a path from sub -> obj
	path := findPath(graph, sub, obj, map[string]bool{})
	if len(path) == 0 {
		fmt.Println("   (no relationship chain found)")
		return
	}

	fmt.Println("   Relationship Chain:")
	for i, node := range path {
		prefix := strings.Repeat("  ", i)
		if i > 0 {
			prefix += "└─ "
		}
		fmt.Printf("     %s%s\n", prefix, node)
	}
}

// Depth-first search to find a single path between two nodes
func findPath(graph map[string][]string, current, target string, visited map[string]bool) []string {
	if visited[current] {
		return nil
	}
	visited[current] = true

	if current == target {
		return []string{current}
	}

	for _, next := range graph[current] {
		if path := findPath(graph, next, target, visited); len(path) > 0 {
			return append([]string{current}, path...)
		}
	}
	return nil
}
